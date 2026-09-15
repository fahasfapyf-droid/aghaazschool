import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const terms = ["FIRST", "SECOND", "THIRD"] as const;
type AcademicTerm = (typeof terms)[number];

const grade = (percentage: number) => {
  if (percentage <= 0) return null;
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "TRY AGAIN";
};

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const className = request.nextUrl.searchParams.get("className");
  const section = request.nextUrl.searchParams.get("section");
  const termParam = request.nextUrl.searchParams.get("term") || "FIRST";
  if (!sessionId || !className) return NextResponse.json({ error: "sessionId and className are required" }, { status: 400 });
  if (!terms.includes(termParam as AcademicTerm)) return NextResponse.json({ error: "Invalid academic term" }, { status: 400 });
  const term = termParam as AcademicTerm;

  const session = await prisma.academicSession.findUnique({ where: { id: sessionId } });
  if (!session) return NextResponse.json({ error: "Academic session not found" }, { status: 404 });

  const configs = await prisma.reportCardSubject.findMany({
    where: { sessionId, className, ...(section ? { section } : {}), term, active: true },
    orderBy: [{ displayOrder: "asc" }, { subject: "asc" }]
  });

  const exams = await prisma.exam.findMany({
    where: { sessionId, term },
    include: { papers: { where: { className }, include: { results: { include: { components: true } } } } },
    orderBy: { startDate: "desc" }
  });

  const paperBySubject = new Map<string, (typeof exams)[number]["papers"][number]>();
  for (const exam of exams) for (const paper of exam.papers) if (!paperBySubject.has(paper.subject.toLowerCase())) paperBySubject.set(paper.subject.toLowerCase(), paper);

  const fallbackSubjects = [...paperBySubject.values()].map(p => ({ subject: p.subject, maxMarks: Number(p.maxMarks), displayOrder: 9999 }));
  const subjects = configs.length ? configs : fallbackSubjects;
  const students = await prisma.enrollment.findMany({
    where: { className, ...(section ? { section } : {}), application: { sessionId } },
    include: { application: true },
    orderBy: { application: { studentName: "asc" } }
  });

  const rows = students.map(student => {
    const values = subjects.map(subject => {
      const paper = paperBySubject.get(subject.subject.toLowerCase());
      const result = paper?.results.find(item => item.studentId === student.id);
      const marks = result ? (result.components.length ? result.components.reduce((sum, component) => sum + Number(component.marks), 0) : Number(result.marks)) : 0;
      const maxMarks = Number(subject.maxMarks);
      return { subject: subject.subject, maxMarks, marks, grade: grade(maxMarks ? marks / maxMarks * 100 : 0) };
    });
    const totalMarks = values.reduce((sum, value) => sum + value.maxMarks, 0);
    const obtainedMarks = values.reduce((sum, value) => sum + value.marks, 0);
    return { id: student.id, name: student.application.studentName, admissionNumber: student.admissionNumber, values, totalMarks, obtainedMarks, percentage: totalMarks ? obtainedMarks / totalMarks * 100 : 0 };
  });

  const ranked = [...rows].sort((a, b) => b.percentage - a.percentage || b.obtainedMarks - a.obtainedMarks || a.name.localeCompare(b.name));
  const positions = new Map<string, number>();
  ranked.forEach((row, index) => {
    const position = ranked.filter(other => other.percentage > row.percentage || (other.percentage === row.percentage && other.obtainedMarks > row.obtainedMarks)).length + 1;
    positions.set(row.id, position || index + 1);
  });

  return NextResponse.json({ session: session.name, className, section, term, subjects, rows: rows.map(row => ({ ...row, position: positions.get(row.id) || null })) });
}
