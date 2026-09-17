import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { queueParentNotification } from "@/lib/communication/events";
import { z } from "zod";

const schema = z.object({
  date: z.string().optional(),
  records: z.array(z.object({ studentId: z.string().min(1), status: z.enum(["PRESENT","ABSENT","LATE","EXCUSED"]), remarks: z.string().trim().max(300).optional() })).min(1).max(1000),
});

const attendanceRoles = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;

function parseDay(value?: string) {
  if (!value) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, date] = value.split("-").map(Number);
  const day = new Date(year, month - 1, date);
  if (day.getFullYear() !== year || day.getMonth() !== month - 1 || day.getDate() !== date) return null;
  return day;
}

function bounds(value?: string) {
  const day = parseDay(value);
  if (!day) return null;
  const start = new Date(day); start.setHours(0, 0, 0, 0);
  const end = new Date(day); end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, [...attendanceRoles])) return NextResponse.json({ error: "You do not have permission to access attendance." }, { status: 403 });
    const range = bounds(request.nextUrl.searchParams.get("date") || undefined);
    if (!range) return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });
    const records = await prisma.attendance.findMany({ where: { date: { gte: range.start, lte: range.end } }, include: { student: { include: { application: true } } }, orderBy: { student: { application: { studentName: "asc" } } } });
    return NextResponse.json(records);
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load attendance" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, [...attendanceRoles])) return NextResponse.json({ error: "You do not have permission to modify attendance." }, { status: 403 });

    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid attendance data", details: parsed.error.flatten() }, { status: 400 });
    const range = bounds(parsed.data.date);
    if (!range) return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 });

    const studentIds = parsed.data.records.map(r => r.studentId);
    if (new Set(studentIds).size !== studentIds.length) return NextResponse.json({ error: "Each student may appear only once in an attendance submission." }, { status: 400 });
    const students = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "Enrollment" WHERE "id" = ANY($1::text[]) AND lower("status") IN ('active','enrolled')`, studentIds);
    if (students.length !== studentIds.length) {
      const found = new Set(students.map(s => s.id));
      return NextResponse.json({ error: "Attendance includes a missing or inactive student.", studentIds: studentIds.filter(id => !found.has(id)) }, { status: 400 });
    }

    const result = await prisma.$transaction(parsed.data.records.map(r => prisma.attendance.upsert({ where: { studentId_date: { studentId: r.studentId, date: range.start } }, update: { status: r.status, remarks: r.remarks }, create: { studentId: r.studentId, date: range.start, status: r.status, remarks: r.remarks } })));

    const absentIds = parsed.data.records.filter(r => r.status === "ABSENT").map(r => r.studentId);
    const approvedLeave = absentIds.length ? await prisma.leaveRequest.findMany({
      where: {
        studentId: { in: absentIds },
        status: "APPROVED",
        startDate: { lte: range.end },
        endDate: { gte: range.start },
      },
      select: { studentId: true },
    }) : [];
    const leaveStudentIds = new Set(approvedLeave.map(item => item.studentId));
    const suppressedByLeave = absentIds.filter(id => leaveStudentIds.has(id));
    const notificationIds = absentIds.filter(id => !leaveStudentIds.has(id));
    const absentNotifications = await Promise.all(notificationIds.map(async enrollmentId => {
      const student = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { application: true } });
      if (!student) return { created: false, reason: "ENROLLMENT_NOT_FOUND" };
      const studentName = student.application.studentName;
      return queueParentNotification({
        eventKey: "ATTENDANCE_ABSENT",
        sourceRef: `${enrollmentId}:${range.start.toISOString().slice(0, 10)}`,
        enrollmentId,
        title: `Absence recorded: ${studentName}`,
        message: `${studentName} was marked absent on ${range.start.toLocaleDateString("en-GB")}. Please contact the school if this absence was expected.`,
        createdBy: user.id,
      });
    }));

    await writeAuditLog({ userId: user.id, action: "ATTENDANCE_SAVED", entityType: "Attendance", metadata: { date: range.start.toISOString().slice(0, 10), recordCount: result.length, counts: parsed.data.records.reduce<Record<string, number>>((counts, record) => { counts[record.status] = (counts[record.status] ?? 0) + 1; return counts; }, {}), absentNotifications: absentNotifications.length, absenceNotificationsSuppressedByApprovedLeave: suppressedByLeave.length }, context: requestAuditContext(request) });
    return NextResponse.json({ records: result, notifications: { attempted: absentNotifications.length, created: absentNotifications.filter(item => item.created).length, suppressedByApprovedLeave: suppressedByLeave.length } }, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save attendance" }, { status: 500 }); }
}
