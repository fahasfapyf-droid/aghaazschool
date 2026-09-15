import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const terms = ["FIRST", "SECOND", "THIRD"] as const;
type AcademicTerm = (typeof terms)[number];
const grade = (percentage: number) => percentage <= 0 ? null : percentage >= 90 ? "A+" : percentage >= 80 ? "A" : percentage >= 70 ? "B+" : percentage >= 60 ? "B" : percentage >= 50 ? "C" : percentage >= 40 ? "D" : "TRY AGAIN";

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
    where: { sessionId, className, ...(section ? { OR: [{ section }, { section: null }] } : {}), term, active: true },
    orderBy: [{ displayOrder: "asc" }, { subject: "asc" }]
  });
  const subjects = section ? configs.filter((subject, _index, all) => subject.section === section || !all.some(other => other.section === section && other.subject.toLowerCase() === subject.subject.toLowerCase())) : configs;

  const exams = await prisma.exam.findMany({
    where: { sessionId, term },
    include: { papers: { where: { className }, include: { results: { include: { components: true } } } } },
    orderBy: { startDate: "desc" }
  });
  const paperBySubject = new Map<string, (typeof exams)[number]["papers"][number]>();
  for (const exam of exams) for (const paper of exam.papers) if (!paperBySubject.has(paper.subject.toLowerCase())) paperBySubject.set(paper.subject.toLowerCase(), paper);
  const fallbackSubjects = [...paperBySubject.values()].map(p => ({ subject: p.subject, maxMarks: Number(p.maxMarks), displayOrder: 9999, section: null }));
  const effectiveSubjects = subjects.length ? subjects : fallbackSubjects;

  const students = await prisma.enrollment.findMany({
    where: { className, ...(section ? { section } : {}), application: { sessionId } },
    include: { application: true },
    orderBy: { application: { studentName: "asc" } }
  });
  const rows = students.map(student => {
    const values = effectiveSubjects.map(subject => {
      const paper = paperBySubject.get(subject.subject.toLowerCase());
      const result = paper?.results.find(item => item.studentId === student.id);
      const marks = result ? (result.components.length ? result.components.reduce((sum, component) => sum + Number(component.marks), 0) : Number(result.marks)) : 0;
      const maxMarks = Number(subject.maxMarks);
      return { subject: subject.subject, maxMarks, marks, grade: grade(maxMarks ? marks / maxMarks * 100 : 0) };
    });
    const totalMarks = values.reduce((sum, value) => sum + value.maxMarks, 0);
    const obtainedMarks = values.reduce((sum, value) => sum + value.marks, 0);
    const completedSubjects = values.filter(value => value.marks > 0).length;
    return { id: student.id, name: student.application.studentName, admissionNumber: student.admissionNumber, values, totalMarks, obtainedMarks, completedSubjects, percentage: totalMarks ? obtainedMarks / totalMarks * 100 : 0 };
  });

  // Position is only assigned among students with the complete configured subject set.
  // This prevents partially entered records from receiving misleading ranks.
  const ranked = [...rows].filter(row => row.completedSubjects === effectiveSubjects.length).sort((a, b) => b.percentage - a.percentage || b.obtainedMarks - a.obtainedMarks || a.name.localeCompare(b.name));
  const positions = new Map<string, number>();
  ranked.forEach((row) => positions.set(row.id, ranked.filter(other => other.percentage > row.percentage || (other.percentage === row.percentage && other.obtainedMarks > row.obtainedMarks)).length + 1));

  return NextResponse.json({ session: session.name, className, section, term, subjects: effectiveSubjects, rows: rows.map(row => ({ ...row, position: positions.get(row.id) || null })) });
}
