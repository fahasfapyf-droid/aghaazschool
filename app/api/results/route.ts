import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { hasReportCardRelease } from "@/lib/report-card-release";

const componentSchema = z.object({ name: z.string().trim().min(1), maxMarks: z.coerce.number().positive(), marks: z.coerce.number().min(0) });
const resultSchema = z.object({ paperId: z.string(), studentId: z.string(), marks: z.coerce.number().min(0).optional(), components: z.array(componentSchema).optional(), remarks: z.string().trim().max(2000).optional() }).refine(value => value.marks !== undefined || value.components !== undefined, { message: "Marks or assessment components are required" });
function grade(marks: number, max: number) { const percentage = max ? marks / max * 100 : 0; if (marks <= 0) return null; if (percentage >= 90) return "A_PLUS"; if (percentage >= 80) return "A"; if (percentage >= 70) return "B_PLUS"; if (percentage >= 60) return "B"; if (percentage >= 50) return "C"; if (percentage >= 40) return "D"; return "TRY_AGAIN"; }
function canEnterResults(role?: string) { return role === "SUPER_ADMIN" || role === "ADMIN" || role === "TEACHER"; }

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
  const examId = req.nextUrl.searchParams.get("examId") || undefined;
  const results = await prisma.result.findMany({ where: { ...(studentId ? { studentId } : {}), ...(examId ? { paper: { examId } } : {}) }, include: { components: true, student: { include: { application: true } }, paper: { include: { exam: true } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canEnterResults(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = resultSchema.parse(await req.json());
    const paper = await prisma.examPaper.findUnique({ where: { id: body.paperId }, include: { exam: true } });
    if (!paper) return NextResponse.json({ error: "Exam paper not found" }, { status: 404 });
    if (paper.exam.status === "PUBLISHED") return NextResponse.json({ error: "This examination is published and its results are locked. An administrator must unpublish it before corrections can be made." }, { status: 409 });
    const student = await prisma.enrollment.findUnique({ where: { id: body.studentId }, include: { application: { select: { sessionId: true } } } });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (student.className !== paper.className) return NextResponse.json({ error: "Student is not enrolled in this paper's class" }, { status: 400 });
    if (student.application.sessionId !== paper.exam.sessionId) return NextResponse.json({ error: "Student is not enrolled in this examination's academic session" }, { status: 400 });
    if (await hasReportCardRelease(student.id, student.application.sessionId)) return NextResponse.json({ error: "This student's official report card has been released and the result is immutable." }, { status: 409 });

    const maxMarks = Number(paper.maxMarks);
    let configured = null;
    if (paper.exam.term) {
      const configs = await prisma.reportCardSubject.findMany({ where: { sessionId: paper.exam.sessionId, className: paper.className, OR: [{ section: student.section || null }, { section: null }], term: paper.exam.term, subject: paper.subject, active: true }, include: { components: { orderBy: { displayOrder: "asc" } } } });
      configured = configs.find(item => item.section === (student.section || null)) || configs.find(item => item.section === null) || null;
    }
    if (configured && Math.abs(Number(configured.maxMarks) - maxMarks) > 0.01) return NextResponse.json({ error: `Exam paper maximum (${maxMarks}) does not match configured maximum (${configured.maxMarks})` }, { status: 400 });

    const configuredComponents = configured?.components ?? [];
    if (configuredComponents.length && !body.components?.length) return NextResponse.json({ error: "This subject requires assessment component marks" }, { status: 400 });
    let marks = body.marks ?? 0;
    const components = body.components;
    if (components?.length) {
      const names = components.map(component => component.name.toLowerCase());
      if (new Set(names).size !== names.length) return NextResponse.json({ error: "Assessment component names must be unique" }, { status: 400 });
      const componentMax = components.reduce((sum, c) => sum + c.maxMarks, 0);
      const componentMarks = components.reduce((sum, c) => sum + c.marks, 0);
      if (Math.abs(componentMax - maxMarks) > 0.01) return NextResponse.json({ error: `Component maximum must total ${maxMarks}` }, { status: 400 });
      if (components.some(c => c.marks > c.maxMarks)) return NextResponse.json({ error: "Component marks cannot exceed their maximum" }, { status: 400 });
      if (configuredComponents.length) {
        if (components.length !== configuredComponents.length) return NextResponse.json({ error: "Submitted assessment components do not match the configured subject" }, { status: 400 });
        const configuredByName = new Map(configuredComponents.map(c => [c.name.toLowerCase(), Number(c.maxMarks)]));
        for (const component of components) { const configuredMax = configuredByName.get(component.name.toLowerCase()); if (configuredMax === undefined || Math.abs(configuredMax - component.maxMarks) > 0.01) return NextResponse.json({ error: `Assessment component '${component.name}' does not match the configured subject` }, { status: 400 }); }
      }
      marks = componentMarks;
    }
    if (marks > maxMarks) return NextResponse.json({ error: `Marks cannot exceed ${maxMarks}` }, { status: 400 });

    const result = await prisma.result.upsert({ where: { paperId_studentId: { paperId: body.paperId, studentId: body.studentId } }, create: { paperId: body.paperId, studentId: body.studentId, marks, grade: grade(marks, maxMarks), remarks: body.remarks, components: components?.length ? { create: components.map(c => ({ name: c.name, maxMarks: c.maxMarks, marks: c.marks })) } : undefined }, update: { marks, grade: grade(marks, maxMarks), remarks: body.remarks, components: components ? { deleteMany: {}, create: components.map(c => ({ name: c.name, maxMarks: c.maxMarks, marks: c.marks })) } : undefined }, include: { components: true, paper: true } });
    await writeAuditLog({ userId: user.id, action: "RESULT_SAVED", entityType: "Result", entityId: result.id, metadata: { studentId: body.studentId, paperId: body.paperId, examId: paper.examId, subject: paper.subject, marks, maxMarks, grade: result.grade }, context: requestAuditContext(req) });
    return NextResponse.json(result);
  } catch (e) { return NextResponse.json({ error: e instanceof z.ZodError ? "Invalid result data" : e instanceof Error ? e.message : "Unable to save result" }, { status: 400 }); }
}
