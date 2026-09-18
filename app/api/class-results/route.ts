import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGradingBands, resolveGrade } from "@/lib/grading";
import { getTeacherSectionIds } from "@/lib/student-access";

const terms = ["FIRST", "SECOND", "THIRD"] as const;
type AcademicTerm = (typeof terms)[number];

function selectConfigurations<T extends { subject: string; section: string | null }>(configs: T[], section: string | null) {
  const selected = new Map<string, T>();
  for (const config of configs) {
    if (section && config.section !== null && config.section !== section) continue;
    const key = config.subject.toLowerCase();
    const current = selected.get(key);
    if (!current || (section && config.section === section)) selected.set(key, config);
  }
  return [...selected.values()];
}

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
  if (user.role === "TEACHER") {
    if (!section) return NextResponse.json({ error: "Teachers must request a specific assigned section." }, { status: 403 });
    const sectionIds = await getTeacherSectionIds(user.id);
    const allowed = sectionIds.length ? await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT s."id" FROM "AcademicSection" s JOIN "AcademicGrade" g ON g."id"=s."gradeId" WHERE s."id" = ANY($1::text[]) AND s."name"=$2 AND g."name"=$3 LIMIT 1`, sectionIds, section) : [];
    if (!allowed.length) return NextResponse.json({ error: "You do not have access to this class section." }, { status: 403 });
  }

  const [configs, gradingBands] = await Promise.all([
    prisma.reportCardSubject.findMany({
      where: { sessionId, className, term, active: true, ...(section ? { OR: [{ section }, { section: null }] } : {}) },
      orderBy: [{ displayOrder: "asc" }, { subject: "asc" }]
    }),
    getGradingBands(sessionId)
  ]);
  const subjects = selectConfigurations(configs, section);
  const exams = await prisma.exam.findMany({ where: { sessionId, term, status: "PUBLISHED" }, include: { papers: { where: { className }, include: { results: { include: { components: true } } } } }, orderBy: { startDate: "desc" } });
  const paperBySubject = new Map<string, (typeof exams)[number]["papers"][number]>();
  for (const exam of exams) for (const paper of exam.papers) if (!paperBySubject.has(paper.subject.toLowerCase())) paperBySubject.set(paper.subject.toLowerCase(), paper);
  const fallbackSubjects = [...paperBySubject.values()].map(p => ({ subject: p.subject, maxMarks: Number(p.maxMarks), displayOrder: 9999, section: null }));
  const effectiveSubjects = subjects.length ? subjects : fallbackSubjects;

  const students = await prisma.enrollment.findMany({ where: { className, ...(section ? { section } : {}), OR: [{ academicSessionId: sessionId }, { academicSessionId: null, application: { sessionId } }] }, include: { application: true }, orderBy: { application: { studentName: "asc" } } });
  const rows = students.map(student => {
    let completedSubjects = 0;
    const values = effectiveSubjects.map(subject => {
      const paper = paperBySubject.get(subject.subject.toLowerCase());
      const result = paper?.results.find(item => item.studentId === student.id);
      if (result) completedSubjects += 1;
      const marks = result ? (result.components.length ? result.components.reduce((sum, component) => sum + Number(component.marks), 0) : Number(result.marks)) : 0;
      const maxMarks = Number(subject.maxMarks);
      const percentage = maxMarks ? marks / maxMarks * 100 : 0;
      return { subject: subject.subject, maxMarks, marks, grade: resolveGrade(gradingBands, percentage) };
    });
    const totalMarks = values.reduce((sum, value) => sum + value.maxMarks, 0);
    const obtainedMarks = values.reduce((sum, value) => sum + value.marks, 0);
    const percentage = totalMarks ? obtainedMarks / totalMarks * 100 : 0;
    return { id: student.id, name: student.application.studentName, admissionNumber: student.admissionNumber, values, totalMarks, obtainedMarks, completedSubjects, percentage, grade: resolveGrade(gradingBands, percentage) };
  });

  const ranked = [...rows].filter(row => row.completedSubjects === effectiveSubjects.length).sort((a, b) => b.percentage - a.percentage || b.obtainedMarks - a.obtainedMarks || a.name.localeCompare(b.name));
  const positions = new Map<string, number>();
  ranked.forEach(row => positions.set(row.id, ranked.filter(other => other.percentage > row.percentage || (other.percentage === row.percentage && other.obtainedMarks > row.obtainedMarks)).length + 1));

  return NextResponse.json({ session: session.name, className, section, term, subjects: effectiveSubjects, rows: rows.map(({ completedSubjects: _completedSubjects, ...row }) => ({ ...row, position: positions.get(row.id) || null })) });
}
