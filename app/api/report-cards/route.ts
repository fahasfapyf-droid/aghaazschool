import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const grade = (percentage: number) => {
  if (percentage <= 0) return null;
  if (percentage >= 90) return "A_PLUS";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B_PLUS";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "TRY_AGAIN";
};

const termOrder: Record<string, number> = { FIRST: 1, SECOND: 2, THIRD: 3 };

const legacyTerm = (name: string) => {
  const value = name.toLowerCase();
  if (/\b(first|1st)\b/.test(value)) return "FIRST";
  if (/\b(second|2nd)\b/.test(value)) return "SECOND";
  if (/\b(third|3rd)\b/.test(value)) return "THIRD";
  return null;
};

const resultMarks = (marks: number, components: { marks: unknown }[]) =>
  components.length ? components.reduce((sum, component) => sum + Number(component.marks), 0) : marks;

const termName = (term: string) => `${term.charAt(0)}${term.slice(1).toLowerCase()} Term`;

type SubjectReport = {
  subject: string;
  maxMarks: number;
  marks: number;
  percentage: number;
  grade: string | null;
  remarks?: string | null;
  components: { name: string; maxMarks: number; marks: number }[];
};

type TermReport = { key: string; name: string; order: number; subjects: SubjectReport[] };

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const student = await prisma.enrollment.findUnique({
    where: { id: studentId },
    include: { application: { include: { session: true } } }
  });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const [results, configurations, attendance] = await Promise.all([
    prisma.result.findMany({
      where: { studentId },
      include: { components: true, paper: { include: { exam: true } } },
      orderBy: [{ paper: { exam: { startDate: "asc" } } }, { paper: { subject: "asc" } }]
    }),
    prisma.reportCardSubject.findMany({
      where: { sessionId: student.application.sessionId, className: student.className, section: student.section || null, active: true },
      include: { components: { orderBy: { displayOrder: "asc" } } },
      orderBy: [{ term: "asc" }, { displayOrder: "asc" }, { subject: "asc" }]
    }),
    prisma.attendance.findMany({
      where: { studentId, date: { gte: student.application.session.startDate, lte: student.application.session.endDate } },
      orderBy: { date: "asc" }
    })
  ]);

  const attendanceSummary = {
    total: attendance.length,
    present: attendance.filter(x => x.status === "PRESENT" || x.status === "LATE").length,
    absent: attendance.filter(x => x.status === "ABSENT").length,
    leave: attendance.filter(x => x.status === "EXCUSED").length
  };

  const resultByTermSubject = new Map<string, typeof results[number]>();
  for (const result of results) {
    const exam = result.paper.exam;
    const key = exam.term || legacyTerm(exam.name) || exam.id;
    resultByTermSubject.set(`${key}:${result.paper.subject.toLowerCase()}`, result);
  }

  const configuredTerms = new Map<string, TermReport>();
  for (const config of configurations) {
    const key = config.term;
    const term = configuredTerms.get(key) || { key, name: termName(key), order: termOrder[key], subjects: [] };
    const result = resultByTermSubject.get(`${key}:${config.subject.toLowerCase()}`);
    const maxMarks = Number(config.maxMarks);
    const marks = result ? resultMarks(Number(result.marks), result.components) : 0;
    const percentage = maxMarks ? marks / maxMarks * 100 : 0;
    term.subjects.push({
      subject: config.subject,
      maxMarks,
      marks,
      percentage,
      grade: result?.grade || grade(percentage),
      remarks: result?.remarks || null,
      components: result?.components.length
        ? result.components.map(c => ({ name: c.name, maxMarks: Number(c.maxMarks), marks: Number(c.marks) }))
        : config.components.map(c => ({ name: c.name, maxMarks: Number(c.maxMarks), marks: 0 }))
    });
    configuredTerms.set(key, term);
  }

  const configuredResultKeys = new Set(configurations.map(c => `${c.term}:${c.subject.toLowerCase()}`));
  const fallbackTerms = new Map<string, TermReport>();
  for (const result of results) {
    const exam = result.paper.exam;
    const key = exam.term || legacyTerm(exam.name) || exam.id;
    if (configuredResultKeys.has(`${key}:${result.paper.subject.toLowerCase()}`)) continue;
    const order = exam.term ? termOrder[exam.term] : legacyTerm(exam.name) ? termOrder[legacyTerm(exam.name)!] : exam.startDate.getTime();
    const name = exam.term ? termName(exam.term) : exam.name;
    const term = fallbackTerms.get(key) || { key, name, order, subjects: [] };
    const maxMarks = Number(result.paper.maxMarks);
    const marks = resultMarks(Number(result.marks), result.components);
    const percentage = maxMarks ? marks / maxMarks * 100 : 0;
    term.subjects.push({
      subject: result.paper.subject,
      maxMarks,
      marks,
      percentage,
      grade: result.grade || grade(percentage),
      remarks: result.remarks,
      components: result.components.map(c => ({ name: c.name, maxMarks: Number(c.maxMarks), marks: Number(c.marks) }))
    });
    fallbackTerms.set(key, term);
  }

  const termReports = [...configuredTerms.values(), ...fallbackTerms.values()]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(term => ({
      ...term,
      totalMarks: term.subjects.reduce((sum, subject) => sum + subject.maxMarks, 0),
      obtainedMarks: term.subjects.reduce((sum, subject) => sum + subject.marks, 0)
    }));

  const totalMarks = termReports.reduce((sum, term) => sum + term.totalMarks, 0);
  const obtainedMarks = termReports.reduce((sum, term) => sum + term.obtainedMarks, 0);
  const percentage = totalMarks ? obtainedMarks / totalMarks * 100 : 0;

  const examIds = [...new Set(results.map(result => result.paper.examId))];
  let position: number | null = null;

  if (examIds.length && totalMarks > 0) {
    const expectedPaperIds = new Set(results.map(result => result.paperId));
    const classmates = await prisma.result.findMany({
      where: {
        paper: { examId: { in: examIds }, exam: { sessionId: student.application.sessionId } },
        student: {
          className: student.className,
          section: student.section,
          application: { sessionId: student.application.sessionId }
        }
      },
      include: { components: true, paper: { select: { maxMarks: true } } }
    });

    const totals = new Map<string, { marks: number; maxMarks: number; papers: Set<string> }>();
    for (const result of classmates) {
      const current = totals.get(result.studentId) || { marks: 0, maxMarks: 0, papers: new Set<string>() };
      current.marks += resultMarks(Number(result.marks), result.components);
      current.maxMarks += Number(result.paper.maxMarks);
      current.papers.add(result.paperId);
      totals.set(result.studentId, current);
    }

    const ranked = [...totals.entries()]
      .filter(([, value]) => value.papers.size === expectedPaperIds.size)
      .map(([id, value]) => ({ id, ...value, percentage: value.maxMarks ? value.marks / value.maxMarks * 100 : 0 }))
      .sort((a, b) => b.percentage - a.percentage || b.marks - a.marks || a.id.localeCompare(b.id));

    const currentRank = ranked.findIndex(item => item.id === studentId);
    if (currentRank >= 0) {
      const current = ranked[currentRank];
      position = ranked.filter(item => item.percentage > current.percentage || (item.percentage === current.percentage && item.marks > current.marks)).length + 1;
    }
  }

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.application.studentName,
      guardianName: student.application.guardianName,
      guardianPhone: student.application.guardianPhone,
      admissionNumber: student.admissionNumber,
      className: student.className,
      section: student.section,
      session: student.application.session.name
    },
    terms: termReports,
    final: { totalMarks, obtainedMarks, percentage, grade: grade(percentage), position },
    attendance: {
      ...attendanceSummary,
      percentage: attendanceSummary.total ? attendanceSummary.present / attendanceSummary.total * 100 : 0
    }
  });
}
