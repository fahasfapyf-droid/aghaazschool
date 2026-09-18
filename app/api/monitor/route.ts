import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { getTeacherSectionIds } from "@/lib/student-access";

const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "You do not have permission to access Monitor." }, { status: 403 });

    const now = new Date();
    const teacherSectionIds = user.role === "TEACHER" ? await getTeacherSectionIds(user.id) : null;
    const teacherEnrollmentIds = teacherSectionIds?.length ? (await prisma.enrollment.findMany({ where: { academicSectionId: { in: teacherSectionIds } }, select: { id: true } })).map(row => row.id) : null;
    if (teacherSectionIds?.length === 0) return NextResponse.json({ generatedAt: now.toISOString(), thresholds: { attendancePercent: 80, minimumAttendanceRecords: 5, overdueFees: true, failingResults: true, overdueHomework: true }, summary: { activeStudents: 0, attendanceExceptions: 0, overdueFees: 0, failingResults: 0, overdueHomework: 0, activeAdmissions: 0, staffAttendanceExceptions: 0 }, exceptions: { attendance: [], fees: [], results: [], homework: [], staffAttendance: [] } });
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const attendanceStart = new Date(todayStart);
    attendanceStart.setDate(attendanceStart.getDate() - 29);

    const [students, attendance, overdueInvoices, recentResults, homework, activeApplications, staffAttendance] = await Promise.all([
      prisma.enrollment.count({ where: { status: "active", ...(teacherSectionIds ? { academicSectionId: { in: teacherSectionIds } } : {}) } }),
      prisma.attendance.findMany({
        where: { date: { gte: attendanceStart, lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000) }, studentId: teacherEnrollmentIds ? { in: teacherEnrollmentIds } : undefined },
        select: { studentId: true, status: true },
      }),
      prisma.feeInvoice.findMany({
        where: { dueDate: { lt: todayStart }, status: { not: "PAID" }, ...(teacherEnrollmentIds ? { studentId: { in: teacherEnrollmentIds } } : {}) },
        select: { id: true, invoiceNumber: true, studentId: true, netAmount: true, dueDate: true, student: { select: { application: { select: { studentName: true } } } } },
        orderBy: { dueDate: "asc" },
        take: 100,
      }),
      prisma.result.findMany({
        where: { createdAt: { gte: monthStart }, ...(teacherEnrollmentIds ? { studentId: { in: teacherEnrollmentIds } } : {}) },
        select: { studentId: true, marks: true, grade: true, paper: { select: { subject: true, passMarks: true, maxMarks: true } }, student: { select: { application: { select: { studentName: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.homework.findMany({
        where: { dueDate: { lt: todayStart }, status: { not: "DRAFT" } },
        select: { id: true, title: true, className: true, section: true, dueDate: true, submissions: { where: { status: "NOT_SUBMITTED" }, select: { id: true } } },
        orderBy: { dueDate: "asc" },
        take: 100,
      }),
      prisma.application.count({ where: { status: { notIn: ["REJECTED", "CANCELLED", "WITHDRAWN", "ENROLLED"] } } }),
      prisma.$queryRawUnsafe<Array<{ staffId:string; status:string; date:string; staffName:string; employeeNumber:string }>>(`SELECT a."staffId",a."status",a."date"::text AS "date",s."name" AS "staffName",s."employeeNumber" FROM "StaffAttendance" a JOIN "Staff" s ON s."id"=a."staffId" WHERE a."date">=$1::date AND a."date"<$2::date ORDER BY a."date" DESC,s."name" ASC`, attendanceStart, new Date(todayStart.getTime()+24*60*60*1000)).catch(() => []),
    ]);

    const attendanceByStudent = new Map<string, { total: number; attended: number }>();
    for (const row of attendance) {
      const current = attendanceByStudent.get(row.studentId) ?? { total: 0, attended: 0 };
      current.total += 1;
      if (row.status === "PRESENT" || row.status === "LATE") current.attended += 1;
      attendanceByStudent.set(row.studentId, current);
    }

    const attendanceExceptions = [...attendanceByStudent.entries()]
      .filter(([, value]) => value.total >= 5 && value.attended / value.total < 0.8)
      .map(([studentId, value]) => ({ studentId, attendancePercent: Number(((value.attended / value.total) * 100).toFixed(1)), total: value.total }))
      .sort((a, b) => a.attendancePercent - b.attendancePercent)
      .slice(0, 25);

    const resultExceptions = recentResults
      .filter((row) => Number(row.marks) < Number(row.paper.passMarks))
      .map((row) => ({ studentId: row.studentId, studentName: row.student.application.studentName, subject: row.paper.subject, marks: Number(row.marks), passMarks: Number(row.paper.passMarks), maxMarks: Number(row.paper.maxMarks) }))
      .slice(0, 25);

    const feeExceptions = overdueInvoices.map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, studentId: invoice.studentId, studentName: invoice.student.application.studentName, amount: Number(invoice.netAmount), dueDate: invoice.dueDate.toISOString().slice(0, 10) })).slice(0, 25);
    const staffAttendanceExceptions = staffAttendance
      .filter((row) => row.status === "ABSENT" || row.status === "LATE" || row.status === "HALF_DAY")
      .slice(0, 25)
      .map((row) => ({ staffId: row.staffId, staffName: row.staffName, employeeNumber: row.employeeNumber, status: row.status, date: row.date }));

    const homeworkExceptions = homework
      .filter((item) => item.submissions.length > 0)
      .map((item) => ({ id: item.id, title: item.title, className: item.className, section: item.section, dueDate: item.dueDate.toISOString().slice(0, 10), notSubmitted: item.submissions.length }))
      .slice(0, 25);

    return NextResponse.json({
      generatedAt: now.toISOString(),
      thresholds: { attendancePercent: 80, minimumAttendanceRecords: 5, overdueFees: true, failingResults: true, overdueHomework: true },
      summary: {
        activeStudents: students,
        attendanceExceptions: attendanceExceptions.length,
        overdueFees: feeExceptions.length,
        failingResults: resultExceptions.length,
        overdueHomework: homeworkExceptions.length,
        activeAdmissions: activeApplications,
        staffAttendanceExceptions: staffAttendanceExceptions.length,
      },
      exceptions: { attendance: attendanceExceptions, fees: feeExceptions, results: resultExceptions, homework: homeworkExceptions, staffAttendance: staffAttendanceExceptions },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load Monitor signals." }, { status: 500 });
  }
}
