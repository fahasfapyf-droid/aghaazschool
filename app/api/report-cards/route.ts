import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const grade = (percentage: number) => percentage >= 90 ? "A_PLUS" : percentage >= 80 ? "A" : percentage >= 70 ? "B_PLUS" : percentage >= 60 ? "B" : percentage >= 50 ? "C" : percentage >= 40 ? "D" : "TRY_AGAIN";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const student = await prisma.enrollment.findUnique({
    where: { id: studentId },
    include: { application: { include: { session: true } } },
  });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const results = await prisma.result.findMany({
    where: { studentId },
    include: { components: true, paper: { include: { exam: true } } },
    orderBy: [{ paper: { exam: { startDate: "asc" } } }, { paper: { subject: "asc" } }],
  });

  const attendance = await prisma.attendance.findMany({ where: { studentId }, orderBy: { date: "asc" } });
  const attendanceSummary = { total: attendance.length, present: attendance.filter(x => x.status === "PRESENT" || x.status === "LATE").length, absent: attendance.filter(x => x.status === "ABSENT").length, leave: attendance.filter(x => x.status === "EXCUSED").length };
  const terms = new Map<string, { name: string; order: number; subjects: { subject: string; maxMarks: number; marks: number; percentage: number; grade: string; components: { name: string; maxMarks: number; marks: number }[] }[] }>();
  for (const r of results) {
    const exam = r.paper.exam;
    const key = exam.id;
    const order = exam.startDate.getTime();
    const term = terms.get(key) || { name: exam.name, order, subjects: [] };
    const maxMarks = Number(r.paper.maxMarks);
    const marks = Number(r.marks);
    term.subjects.push({ subject: r.paper.subject, maxMarks, marks, percentage: maxMarks ? marks / maxMarks * 100 : 0, grade: r.grade || grade(maxMarks ? marks / maxMarks * 100 : 0), components: r.components.map(c => ({ name: c.name, maxMarks: Number(c.maxMarks), marks: Number(c.marks) })) });
    terms.set(key, term);
  }
  const termReports = [...terms.values()].sort((a, b) => a.order - b.order).map(t => ({ name: t.name, subjects: t.subjects, totalMarks: t.subjects.reduce((n, s) => n + s.maxMarks, 0), obtainedMarks: t.subjects.reduce((n, s) => n + s.marks, 0) }));
  const totalMarks = termReports.reduce((n, t) => n + t.totalMarks, 0);
  const obtainedMarks = termReports.reduce((n, t) => n + t.obtainedMarks, 0);
  const percentage = totalMarks ? obtainedMarks / totalMarks * 100 : 0;

  const classmates = await prisma.result.findMany({ where: { paper: { className: student.className }, student: { className: student.className, section: student.section }, }, select: { studentId: true, marks: true, paper: { select: { maxMarks: true, exam: { select: { sessionId: true } } } } } });
  const totals = new Map<string, number>();
  const maxTotals = new Map<string, number>();
  for (const r of classmates) { totals.set(r.studentId, (totals.get(r.studentId) || 0) + Number(r.marks)); maxTotals.set(r.studentId, (maxTotals.get(r.studentId) || 0) + Number(r.paper.maxMarks)); }
  const ranked = [...totals.entries()].filter(([id]) => maxTotals.get(id)).sort((a, b) => (b[1] / (maxTotals.get(b[0]) || 1)) - (a[1] / (maxTotals.get(a[0]) || 1)) || b[1] - a[1]);
  const position = ranked.findIndex(([id]) => id === studentId) + 1;

  return NextResponse.json({ student: { id: student.id, name: student.application.studentName, guardianName: student.application.guardianName, guardianPhone: student.application.guardianPhone, admissionNumber: student.admissionNumber, className: student.className, section: student.section, session: student.application.session.name }, terms: termReports, final: { totalMarks, obtainedMarks, percentage, grade: grade(percentage), position: position || null }, attendance: { ...attendanceSummary, percentage: attendanceSummary.total ? (attendanceSummary.present / attendanceSummary.total) * 100 : 0 } });
}
