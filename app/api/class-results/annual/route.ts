import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getGradingBands, resolveGrade } from "@/lib/grading";
import { getTeacherSectionIds } from "@/lib/student-access";

type Config = { term: "FIRST" | "SECOND" | "THIRD"; subject: string; maxMarks: unknown; displayOrder: number; section: string | null };

function selectConfigurations(configs: Config[], section: string | null) {
  const selected = new Map<string, Config>();
  for (const config of configs) {
    if (section && config.section !== null && config.section !== section) continue;
    const key = `${config.term}:${config.subject.toLowerCase()}`;
    const current = selected.get(key);
    if (!current || (section && config.section === section)) selected.set(key, config);
  }
  return [...selected.values()].sort((a, b) => a.term.localeCompare(b.term) || a.displayOrder - b.displayOrder || a.subject.localeCompare(b.subject));
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const className = request.nextUrl.searchParams.get("className");
  const section = request.nextUrl.searchParams.get("section");
  if (!sessionId || !className) return NextResponse.json({ error: "sessionId and className are required" }, { status: 400 });

  const session = await prisma.academicSession.findUnique({ where: { id: sessionId } });
  if (!session) return NextResponse.json({ error: "Academic session not found" }, { status: 404 });
  if (user.role === "TEACHER") {
    if (!section) return NextResponse.json({ error: "Teachers must request a specific assigned section." }, { status: 403 });
    const sectionIds = await getTeacherSectionIds(user.id);
    const allowed = sectionIds.length ? await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT s."id" FROM "AcademicSection" s JOIN "AcademicGrade" g ON g."id"=s."gradeId" WHERE s."id" = ANY($1::text[]) AND s."name"=$2 AND g."name"=$3 LIMIT 1`, sectionIds, section) : [];
    if (!allowed.length) return NextResponse.json({ error: "You do not have access to this class section." }, { status: 403 });
  }

  const [rawConfigs, gradingBands] = await Promise.all([
    prisma.reportCardSubject.findMany({
      where: { sessionId, className, active: true, ...(section ? { OR: [{ section }, { section: null }] } : {}) },
      select: { term: true, subject: true, maxMarks: true, displayOrder: true, section: true },
      orderBy: [{ term: "asc" }, { displayOrder: "asc" }, { subject: "asc" }]
    }),
    getGradingBands(sessionId)
  ]);
  const configs = selectConfigurations(rawConfigs as Config[], section);

  const exams = await prisma.exam.findMany({
    where: { sessionId, term: { in: ["FIRST", "SECOND", "THIRD"] }, status: "PUBLISHED" },
    include: { papers: { where: { className }, include: { results: { include: { components: true } } } } },
    orderBy: { startDate: "desc" }
  });

  const paperByKey = new Map<string, (typeof exams)[number]["papers"][number]>();
  for (const exam of exams) {
    if (!exam.term) continue;
    for (const paper of exam.papers) {
      const key = `${exam.term}:${paper.subject.toLowerCase()}`;
      if (!paperByKey.has(key)) paperByKey.set(key, paper);
    }
  }

  const fallback = [...paperByKey.entries()].map(([key, paper]) => {
    const [term] = key.split(":");
    return { term: term as Config["term"], subject: paper.subject, maxMarks: paper.maxMarks, displayOrder: 9999, section: null };
  });
  const subjects = configs.length ? configs : fallback;
  const expectedKeys = new Set(subjects.map(item => `${item.term}:${item.subject.toLowerCase()}`));

  const students = await prisma.enrollment.findMany({
    where: { className, ...(section ? { section } : {}), academicSessionId: sessionId },
    include: { application: true },
    orderBy: { application: { studentName: "asc" } }
  });

  const rows = students.map(student => {
    const values = subjects.map(subject => {
      const key = `${subject.term}:${subject.subject.toLowerCase()}`;
      const paper = paperByKey.get(key);
      const result = paper?.results.find(item => item.studentId === student.id);
      const marks = result ? (result.components.length ? result.components.reduce((sum, component) => sum + Number(component.marks), 0) : Number(result.marks)) : 0;
      const maxMarks = Number(subject.maxMarks);
      const percentage = maxMarks ? marks / maxMarks * 100 : 0;
      return { term: subject.term, subject: subject.subject, maxMarks, marks, grade: resolveGrade(gradingBands, percentage), completed: Boolean(result) };
    });
    const totalMarks = values.reduce((sum, value) => sum + value.maxMarks, 0);
    const obtainedMarks = values.reduce((sum, value) => sum + value.marks, 0);
    const completedSubjects = values.filter(value => value.completed).length;
    const percentage = totalMarks ? obtainedMarks / totalMarks * 100 : 0;
    return { id: student.id, name: student.application.studentName, admissionNumber: student.admissionNumber, values, totalMarks, obtainedMarks, completedSubjects, percentage, grade: resolveGrade(gradingBands, percentage) };
  });

  const ranked = [...rows].filter(row => row.completedSubjects === expectedKeys.size).sort((a, b) => b.percentage - a.percentage || b.obtainedMarks - a.obtainedMarks || a.name.localeCompare(b.name));
  const positions = new Map<string, number>();
  ranked.forEach(row => positions.set(row.id, ranked.filter(other => other.percentage > row.percentage || (other.percentage === row.percentage && other.obtainedMarks > row.obtainedMarks)).length + 1));

  return NextResponse.json({ session: session.name, className, section, term: "ANNUAL", subjects, rows: rows.map(({ completedSubjects: _completedSubjects, ...row }) => ({ ...row, position: positions.get(row.id) || null })) });
}
