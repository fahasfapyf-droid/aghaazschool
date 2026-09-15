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
const termName = (term: string) => `${term.charAt(0)}${term.slice(1).toLowerCase()} Term`;
const legacyTerm = (name: string) => {
  const value = name.toLowerCase();
  if (/\b(first|1st)\b/.test(value)) return "FIRST";
  if (/\b(second|2nd)\b/.test(value)) return "SECOND";
  if (/\b(third|3rd)\b/.test(value)) return "THIRD";
  return null;
};
const resultMarks = (marks: number, components: { marks: unknown }[]) =>
  components.length ? components.reduce((sum, component) => sum + Number(component.marks), 0) : marks;

type SubjectReport = {
  subject: string;
  maxMarks: number;
  marks: number | null;
  percentage: number | null;
  grade: string | null;
  entered: boolean;
  remarks?: string | null;
  components: { name: string; maxMarks: number; marks: number }[];
};
type TermReport = {
  key: string;
  name: string;
  order: number;
  subjects: SubjectReport[];
  totalMarks: number;
  obtainedMarks: number;
  enteredSubjects: number;
  complete: boolean;
};
type Config = {
  term: string;
  subject: string;
  section: string | null;
  active: boolean;
  maxMarks: unknown;
  components: { name: string; maxMarks: unknown }[];
  displayOrder: number;
};

function mergeConfigurations(configs: Config[], section: string | null) {
  const selected = new Map<string, Config>();
  for (const config of configs) {
    if (section && config.section !== section && config.section !== null) continue;
    const key = `${config.term}:${config.subject.toLowerCase()}`;
    const current = selected.get(key);
    if (!current || (section && config.section === section) || (!section && config.section === null)) {
      selected.set(key, config);
    }
  }
  return [...selected.values()];
}

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId");
  if (!studentId) return NextResponse.json({ error: "studentId is required" }, { status: 400 });

  const student = await prisma.enrollment.findUnique({
    where: { id: studentId },
    include: { application: { include: { session: true } } },
  });
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const [results, rawConfigurations, attendance] = await Promise.all([
    prisma.result.findMany({
      where: { studentId },
      include: { components: true, paper: { include: { exam: true } } },
      orderBy: [{ paper: { exam: { startDate: "asc" } } }, { paper: { subject: "asc" } }],
    }),
    prisma.reportCardSubject.findMany({
      where: {
        sessionId: student.application.sessionId,
        className: student.className,
        OR: [{ section: student.section || null }, { section: null }],
      },
      include: { components: { orderBy: { displayOrder: "asc" } } },
      orderBy: [{ term: "asc" }, { displayOrder: "asc" }, { subject: "asc" }],
    }),
    prisma.attendance.findMany({
      where: {
        studentId,
        date: { gte: student.application.session.startDate, lte: student.application.session.endDate },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const allConfigurations = mergeConfigurations(rawConfigurations as Config[], student.section || null);
  const configurations = allConfigurations.filter(config => config.active);
  const removedKeys = new Set(
    allConfigurations.filter(config => !config.active).map(config => `${config.term}:${config.subject.toLowerCase()}`),
  );
  const attendanceSummary = {
    total: attendance.length,
    present: attendance.filter(x => x.status === "PRESENT" || x.status === "LATE").length,
    absent: attendance.filter(x => x.status === "ABSENT").length,
    leave: attendance.filter(x => x.status === "EXCUSED").length,
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
    const term = configuredTerms.get(key) || {
      key,
      name: termName(key),
      order: termOrder[key] ?? 99,
      subjects: [],
      totalMarks: 0,
      obtainedMarks: 0,
      enteredSubjects: 0,
      complete: false,
    };
    const result = resultByTermSubject.get(`${key}:${config.subject.toLowerCase()}`);
    const maxMarks = Number(config.maxMarks);
    const entered = Boolean(result);
    const marks = entered ? resultMarks(Number(result!.marks), result!.components) : null;
    const percentage = entered && maxMarks ? (marks! / maxMarks) * 100 : null;
    term.subjects.push({
      subject: config.subject,
      maxMarks,
      marks,
      percentage,
      grade: entered ? (result!.grade || grade(percentage!)) : null,
      entered,
      remarks: result?.remarks || null,
      components:
        entered && result!.components.length
          ? result!.components.map(c => ({ name: c.name, maxMarks: Number(c.maxMarks), marks: Number(c.marks) }))
          : config.components.map(c => ({ name: c.name, maxMarks: Number(c.maxMarks), marks: 0 })),
    });
    term.totalMarks += maxMarks;
    if (entered) {
      term.obtainedMarks += marks!;
      term.enteredSubjects += 1;
    }
    configuredTerms.set(key, term);
  }

  const configuredResultKeys = new Set(allConfigurations.map(c => `${c.term}:${c.subject.toLowerCase()}`));
  const fallbackTerms = new Map<string, TermReport>();
  for (const result of results) {
    const exam = result.paper.exam;
    const key = exam.term || legacyTerm(exam.name) || exam.id;
    const subjectKey = `${key}:${result.paper.subject.toLowerCase()}`;
    if (configuredResultKeys.has(subjectKey) || removedKeys.has(subjectKey)) continue;
    const detectedLegacyTerm = legacyTerm(exam.name);
    const order = exam.term ? termOrder[exam.term] : detectedLegacyTerm ? termOrder[detectedLegacyTerm] : exam.startDate.getTime();
    const name = exam.term ? termName(exam.term) : exam.name;
    const term = fallbackTerms.get(key) || {
      key,
      name,
      order,
      subjects: [],
      totalMarks: 0,
      obtainedMarks: 0,
      enteredSubjects: 0,
      complete: false,
    };
    const maxMarks = Number(result.paper.maxMarks);
    const marks = resultMarks(Number(result.marks), result.components);
    term.subjects.push({
      subject: result.paper.subject,
      maxMarks,
      marks,
      percentage: maxMarks ? (marks / maxMarks) * 100 : 0,
      grade: result.grade || grade(maxMarks ? (marks / maxMarks) * 100 : 0),
      entered: true,
      remarks: result.remarks,
      components: result.components.map(c => ({ name: c.name, maxMarks: Number(c.maxMarks), marks: Number(c.marks) })),
    });
    term.totalMarks += maxMarks;
    term.obtainedMarks += marks;
    term.enteredSubjects += 1;
    fallbackTerms.set(key, term);
  }

  const termReports = [...configuredTerms.values(), ...fallbackTerms.values()]
    .map(term => ({ ...term, complete: term.enteredSubjects === term.subjects.length && term.subjects.length > 0 }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  const totalMarks = termReports.reduce((sum, term) => sum + term.totalMarks, 0);
  const obtainedMarks = termReports.reduce((sum, term) => sum + term.obtainedMarks, 0);
  const annualExpectedSubjects = termReports.reduce((sum, term) => sum + term.subjects.length, 0);
  const annualEnteredSubjects = termReports.reduce((sum, term) => sum + term.enteredSubjects, 0);
  const annualComplete =
    termReports.length > 0 &&
    annualExpectedSubjects > 0 &&
    annualEnteredSubjects === annualExpectedSubjects &&
    termReports.every(term => term.complete);
  const percentage = annualComplete && totalMarks ? (obtainedMarks / totalMarks) * 100 : null;

  let position: number | null = null;
  if (annualComplete && totalMarks > 0) {
    const classmates = await prisma.enrollment.findMany({
      where: {
        className: student.className,
        section: student.section,
        application: { sessionId: student.application.sessionId },
      },
      select: { id: true },
    });
    const classmateIds = classmates.map(item => item.id);
    const classResults = await prisma.result.findMany({
      where: {
        studentId: { in: classmateIds },
        paper: { className: student.className, exam: { sessionId: student.application.sessionId } },
      },
      include: { components: true, paper: { include: { exam: true } } },
    });
    const totals = new Map<string, { marks: number; maxMarks: number; keys: Set<string> }>();
    for (const result of classResults) {
      const exam = result.paper.exam;
      const term = exam.term || legacyTerm(exam.name);
      if (!term) continue;
      const key = `${term}:${result.paper.subject.toLowerCase()}`;
      if (removedKeys.has(key)) continue;
      const config = configurations.find(item => `${item.term}:${item.subject.toLowerCase()}` === key);
      if (configurations.length && !config) continue;
      const maxMarks = config ? Number(config.maxMarks) : Number(result.paper.maxMarks);
      const marks = resultMarks(Number(result.marks), result.components);
      const current = totals.get(result.studentId) || { marks: 0, maxMarks: 0, keys: new Set<string>() };
      if (!current.keys.has(key)) {
        current.marks += marks;
        current.maxMarks += maxMarks;
        current.keys.add(key);
      }
      totals.set(result.studentId, current);
    }
    const expectedKeys = configurations.length
      ? new Set(configurations.map(item => `${item.term}:${item.subject.toLowerCase()}`))
      : new Set(termReports.flatMap(term => term.subjects.map(subject => `${term.key}:${subject.subject.toLowerCase()}`)));
    const ranked = [...totals.entries()]
      .filter(([, value]) => value.keys.size === expectedKeys.size)
      .map(([id, value]) => ({ id, ...value, percentage: value.maxMarks ? (value.marks / value.maxMarks) * 100 : 0 }))
      .sort((a, b) => b.percentage - a.percentage || b.marks - a.marks || a.id.localeCompare(b.id));
    const current = ranked.find(item => item.id === studentId);
    if (current) {
      position =
        ranked.filter(item => item.percentage > current.percentage || (item.percentage === current.percentage && item.marks > current.marks)).length + 1;
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
      session: student.application.session.name,
    },
    terms: termReports,
    final: {
      totalMarks,
      obtainedMarks,
      percentage,
      grade: annualComplete ? grade(percentage!) : null,
      position,
      complete: annualComplete,
      enteredSubjects: annualEnteredSubjects,
      expectedSubjects: annualExpectedSubjects,
    },
    attendance: {
      ...attendanceSummary,
      percentage: attendanceSummary.total ? (attendanceSummary.present / attendanceSummary.total) * 100 : 0,
    },
  });
}
