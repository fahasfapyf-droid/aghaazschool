import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import type { UserRole } from "@prisma/client";

const ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "TEACHER"];

function dayName(date: Date) {
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][date.getDay()];
}

function dayBounds(date: Date) {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(date); end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, ROLES)) return NextResponse.json({ error: "You do not have permission to access the teacher workspace." }, { status: 403 });

    const requestedStaffId = request.nextUrl.searchParams.get("staffId") || "";
    const staffRows = await prisma.staff.findMany({ where: { staffType: "TEACHER", active: true }, select: { id: true, employeeNumber: true, name: true, email: true, designation: true }, orderBy: { name: "asc" } });
    if (!staffRows.length) return NextResponse.json({ staff: [], teachers: [], schedule: [], classes: [], homework: [], actions: [], staffAttendance: null });

    let staff = requestedStaffId ? staffRows.find(x => x.id === requestedStaffId) : undefined;
    if (user.role === "TEACHER") {
      staff = staffRows.find(x => (x.email || "").trim().toLowerCase() === user.email.trim().toLowerCase());
      if (!staff) return NextResponse.json({ error: "Your user account is not linked to an active teacher record. Ask an administrator to link your staff email." }, { status: 409 });
    }
    if (!staff) staff = staffRows[0];

    const now = new Date();
    const { start, end } = dayBounds(now);
    const today = dayName(now);
    const schedule = await prisma.$queryRawUnsafe<Array<Record<string, string | number | null>>>(`
      SELECT t."id", t."dayOfWeek", t."startTime", t."endTime", t."period", t."room",
             COALESCE(g."name", t."className") AS "gradeName",
             COALESCE(sec."name", t."section") AS "sectionName",
             COALESCE(sub."name", t."subject") AS "subjectName",
             t."academicSessionId", t."academicGradeId", t."academicSectionId", t."academicSubjectId"
      FROM "TimetableEntry" t
      LEFT JOIN "AcademicGrade" g ON g."id"=t."academicGradeId"
      LEFT JOIN "AcademicSection" sec ON sec."id"=t."academicSectionId"
      LEFT JOIN "AcademicSubject" sub ON sub."id"=t."academicSubjectId"
      WHERE t."teacherStaffId"=$1
      ORDER BY CASE t."dayOfWeek" WHEN 'MONDAY' THEN 1 WHEN 'TUESDAY' THEN 2 WHEN 'WEDNESDAY' THEN 3 WHEN 'THURSDAY' THEN 4 WHEN 'FRIDAY' THEN 5 WHEN 'SATURDAY' THEN 6 WHEN 'SUNDAY' THEN 7 ELSE 8 END, t."period", t."startTime"
    `, staff.id);

    const todaySchedule = schedule.filter(x => x.dayOfWeek === today);
    const sectionIds = [...new Set(todaySchedule.map(x => String(x.academicSectionId || "")).filter(Boolean))];
    let classes: Array<Record<string, unknown>> = [];
    if (sectionIds.length) {
      const students = await prisma.enrollment.findMany({ where: { academicSectionId: { in: sectionIds }, status: "active" }, select: { id: true, academicSectionId: true, application: { select: { studentName: true } } }, orderBy: { application: { studentName: "asc" } } });
      const ids = students.map(x => x.id);
      const attendance = ids.length ? await prisma.attendance.findMany({ where: { studentId: { in: ids }, date: { gte: start, lte: end } }, select: { studentId: true, status: true } }) : [];
      const attendanceByStudent = new Map(attendance.map(x => [x.studentId, x.status]));
      classes = sectionIds.map(sectionId => {
        const sectionStudents = students.filter(x => x.academicSectionId === sectionId);
        const recorded = sectionStudents.filter(x => attendanceByStudent.has(x.id)).length;
        const absent = sectionStudents.filter(x => attendanceByStudent.get(x.id) === "ABSENT").length;
        const late = sectionStudents.filter(x => attendanceByStudent.get(x.id) === "LATE").length;
        const present = sectionStudents.filter(x => attendanceByStudent.get(x.id) === "PRESENT").length;
        const slot = todaySchedule.find(x => x.academicSectionId === sectionId);
        return { sectionId, gradeName: slot?.gradeName || "Class", sectionName: slot?.sectionName || null, students: sectionStudents.length, attendanceRecorded: recorded, present, absent, late, attendanceComplete: recorded === sectionStudents.length && sectionStudents.length > 0, studentIds: sectionStudents.map(x => x.id) };
      });
    }

    const homework = await prisma.homework.findMany({ where: { teacher: staff.name, status: { not: "CLOSED" }, dueDate: { gte: start } }, orderBy: { dueDate: "asc" }, take: 20, include: { _count: { select: { submissions: true } } } });
    const actionRows = await prisma.$queryRawUnsafe<Array<{ id: string; title: string; description: string; status: string; dueDate: Date | null }>>(`
      SELECT "id","title","description","status","dueDate" FROM "MonitorAction"
      WHERE "assignedTo"=$1 AND "status" IN ('OPEN','IN_PROGRESS')
      ORDER BY CASE WHEN "dueDate" IS NULL THEN 1 ELSE 0 END, "dueDate" ASC, "createdAt" ASC LIMIT 20
    `, staff.id);
    const staffAttendanceRows = await prisma.$queryRawUnsafe<Array<{ id: string; status: string; checkIn: Date | null; checkOut: Date | null; remarks: string | null }>>(`
      SELECT "id","status","checkIn","checkOut","remarks" FROM "StaffAttendance"
      WHERE "staffId"=$1 AND "date"=$2::date LIMIT 1
    `, staff.id, start.toISOString().slice(0, 10));
    const staffAttendance = staffAttendanceRows[0] ? { ...staffAttendanceRows[0], checkIn: staffAttendanceRows[0].checkIn?.toISOString() || null, checkOut: staffAttendanceRows[0].checkOut?.toISOString() || null } : null;

    return NextResponse.json({
      staff: { id: staff.id, employeeNumber: staff.employeeNumber, name: staff.name, email: staff.email, designation: staff.designation },
      teachers: staffRows.map(x => ({ id: x.id, employeeNumber: x.employeeNumber, name: x.name, email: x.email })),
      date: start.toISOString().slice(0, 10),
      today,
      schedule,
      todaySchedule,
      classes,
      homework: homework.map(x => ({ id: x.id, title: x.title, subject: x.subject, className: x.className, section: x.section, dueDate: x.dueDate, submissions: x._count.submissions, status: x.status })),
      actions: actionRows.map(x => ({ ...x, dueDate: x.dueDate?.toISOString() || null })),
      staffAttendance,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load teacher workspace." }, { status: 500 });
  }
}
