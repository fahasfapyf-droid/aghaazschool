import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;

type Signal = { code: string; label: string; detail: string; href: string };
type SupportRow = {
  id: string; studentName: string; className: string; section: string | null; grNumber: string | null;
  attendanceTotal: number; attendancePresent: number; overdueFees: number; overdueBalance: number;
  failingResults: number; overdueHomework: number; openBehaviour: number; seriousBehaviour: number;
};

export async function GET(_request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const rows = await prisma.$queryRawUnsafe<SupportRow[]>(`
      SELECT e."id", a."studentName", e."className", e."section", sr."grNumber",
        (SELECT COUNT(*)::int FROM "Attendance" at WHERE at."studentId"=e."id" AND at."date">=CURRENT_DATE-INTERVAL '30 days') AS "attendanceTotal",
        (SELECT COUNT(*)::int FROM "Attendance" at WHERE at."studentId"=e."id" AND at."date">=CURRENT_DATE-INTERVAL '30 days' AND at."status" IN ('PRESENT','LATE')) AS "attendancePresent",
        (SELECT COUNT(*)::int FROM "FeeInvoice" fi WHERE fi."studentId"=e."id" AND fi."dueDate"<CURRENT_DATE AND fi."status"<>'PAID' AND (fi."netAmount"-COALESCE((SELECT SUM(fp."amount") FROM "FeePayment" fp WHERE fp."invoiceId"=fi."id"),0))>0) AS "overdueFees",
        COALESCE((SELECT SUM(fi."netAmount"-COALESCE((SELECT SUM(fp."amount") FROM "FeePayment" fp WHERE fp."invoiceId"=fi."id"),0)) FROM "FeeInvoice" fi WHERE fi."studentId"=e."id" AND fi."dueDate"<CURRENT_DATE AND fi."status"<>'PAID' AND (fi."netAmount"-COALESCE((SELECT SUM(fp."amount") FROM "FeePayment" fp WHERE fp."invoiceId"=fi."id"),0))>0),0)::float AS "overdueBalance",
        (SELECT COUNT(*)::int FROM "Result" r JOIN "ExamPaper" p ON p."id"=r."paperId" JOIN "Exam" ex ON ex."id"=p."examId" WHERE r."studentId"=e."id" AND ex."status"='PUBLISHED' AND r."createdAt">=date_trunc('month',CURRENT_DATE) AND r."marks"<p."passMarks") AS "failingResults",
        (SELECT COUNT(*)::int FROM "HomeworkSubmission" hs JOIN "Homework" h ON h."id"=hs."homeworkId" WHERE hs."studentId"=e."id" AND h."dueDate"<CURRENT_DATE AND h."status"<>'DRAFT' AND hs."status"='NOT_SUBMITTED') AS "overdueHomework",
        (SELECT COUNT(*)::int FROM "StudentBehaviourRecord" b WHERE b."enrollmentId"=e."id" AND b."status" IN ('OPEN','IN_PROGRESS')) AS "openBehaviour",
        (SELECT COUNT(*)::int FROM "StudentBehaviourRecord" b WHERE b."enrollmentId"=e."id" AND b."status" IN ('OPEN','IN_PROGRESS') AND b."severity" IN ('HIGH','CRITICAL')) AS "seriousBehaviour"
      FROM "Enrollment" e
      JOIN "Application" a ON a."id"=e."applicationId"
      LEFT JOIN "StudentRegistry" sr ON sr."enrollmentId"=e."id"
      WHERE e."status" NOT IN ('inactive','INACTIVE','WITHDRAWN','withdrawn','TRANSFERRED','transferred')
      ORDER BY a."studentName" ASC
      LIMIT 1000
    `);

    const students = rows.map((r) => {
      const signals: Signal[] = [];
      const attendancePercent = r.attendanceTotal ? Math.round((r.attendancePresent / r.attendanceTotal) * 100) : null;
      if (attendancePercent !== null && r.attendanceTotal >= 5 && attendancePercent < 80) signals.push({ code: "ATTENDANCE", label: "Attendance below 80%", detail: `${attendancePercent}% across ${r.attendanceTotal} recorded days in the last 30 days.`, href: `/students/${r.id}` });
      if (r.overdueFees > 0) signals.push({ code: "FEES", label: "Overdue fees", detail: `${r.overdueFees} invoice${r.overdueFees === 1 ? "" : "s"} outstanding · PKR ${Number(r.overdueBalance).toLocaleString()}.`, href: "/fees" });
      if (r.failingResults > 0) signals.push({ code: "ACADEMIC", label: "Recent failing results", detail: `${r.failingResults} published result${r.failingResults === 1 ? "" : "s"} below the configured pass mark this month.`, href: `/students/${r.id}` });
      if (r.overdueHomework > 0) signals.push({ code: "HOMEWORK", label: "Overdue homework", detail: `${r.overdueHomework} assignment submission${r.overdueHomework === 1 ? "" : "s"} still not submitted.`, href: "/homework" });
      if (r.openBehaviour > 0) signals.push({ code: "WELLBEING", label: "Open wellbeing follow-up", detail: `${r.openBehaviour} open behaviour/wellbeing record${r.openBehaviour === 1 ? "" : "s"}${r.seriousBehaviour ? ` · ${r.seriousBehaviour} high/critical` : ""}.`, href: "/behaviour" });
      const priority = r.seriousBehaviour > 0 || signals.length >= 3 ? "HIGH" : signals.length === 2 ? "WATCH" : signals.length === 1 ? "MONITOR" : "CLEAR";
      return { id: r.id, studentName: r.studentName, className: r.className, section: r.section, grNumber: r.grNumber, priority, signals };
    });

    return NextResponse.json({ generatedAt: new Date().toISOString(), thresholds: { attendancePercent: 80, minimumAttendanceRecords: 5 }, summary: { students: students.length, high: students.filter(x => x.priority === "HIGH").length, watch: students.filter(x => x.priority === "WATCH").length, monitor: students.filter(x => x.priority === "MONITOR").length, clear: students.filter(x => x.priority === "CLEAR").length }, students });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to generate student support signals." }, { status: 500 });
  }
}
