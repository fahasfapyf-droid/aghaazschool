import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { hasAnyReportCardRelease } from "@/lib/report-card-release";

const patchSchema = z.object({ name: z.string().min(2).optional(), status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]).optional(), startDate: z.string().optional(), endDate: z.string().optional() });
const adminRoles = new Set(["SUPER_ADMIN", "ADMIN"]);
const allowedTransitions: Record<string, string[]> = { DRAFT: ["SCHEDULED"], SCHEDULED: ["PUBLISHED"], PUBLISHED: ["SCHEDULED"] };

function grade(marks: number, maxMarks: number) {
  const percentage = maxMarks ? (marks / maxMarks) * 100 : 0;
  if (marks <= 0) return null;
  if (percentage >= 90) return "A_PLUS";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B_PLUS";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "TRY_AGAIN";
}

async function getPaperReadiness(paper: { id: string; className: string; subject: string; maxMarks: unknown; results: { id: string; studentId: string; marks: unknown; grade: string | null; components: { maxMarks: unknown; marks: unknown }[] }[] }, sessionId: string) {
  const students = await prisma.enrollment.findMany({ where: { className: paper.className, status: "active", application: { sessionId } }, select: { id: true } });
  const expectedIds = new Set(students.map(student => student.id));
  const resultByStudent = new Map(paper.results.filter(result => expectedIds.has(result.studentId)).map(result => [result.studentId, result]));
  const maxMarks = Number(paper.maxMarks);
  let invalid = 0;
  for (const result of resultByStudent.values()) {
    const marks = Number(result.marks);
    let bad = !Number.isFinite(marks) || marks < 0 || marks > maxMarks || result.grade !== grade(marks, maxMarks);
    if (result.components.length) {
      const componentMax = result.components.reduce((sum, component) => sum + Number(component.maxMarks), 0);
      const componentMarks = result.components.reduce((sum, component) => sum + Number(component.marks), 0);
      bad = bad || Math.abs(componentMax - maxMarks) > 0.01 || Math.abs(componentMarks - marks) > 0.01 || result.components.some(component => Number(component.marks) < 0 || Number(component.marks) > Number(component.maxMarks));
    }
    if (bad) invalid += 1;
  }
  const entered = resultByStudent.size;
  return { paperId: paper.id, subject: paper.subject, className: paper.className, expected: students.length, entered, missing: Math.max(students.length - entered, 0), invalid, ready: students.length > 0 && entered === students.length && invalid === 0 };
}

async function validatePublication(examId: string, sessionId: string) {
  const papers = await prisma.examPaper.findMany({ where: { examId }, include: { results: { include: { components: true } } }, orderBy: [{ className: "asc" }, { subject: "asc" }] });
  if (!papers.length) return ["An examination must have at least one paper before it can be published"];
  const errors: string[] = [];
  for (const paper of papers) {
    const summary = await getPaperReadiness(paper, sessionId);
    if (!summary.expected) { errors.push(`${paper.subject} (${paper.className}): no active students are enrolled for this examination session`); continue; }
    if (summary.missing) errors.push(`${paper.subject} (${paper.className}): ${summary.missing} active student result${summary.missing === 1 ? "" : "s"} missing`);
    if (summary.invalid) errors.push(`${paper.subject} (${paper.className}): ${summary.invalid} result${summary.invalid === 1 ? "" : "s"} contain invalid marks, components, or grade calculations`);
  }
  return errors;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const exam = await prisma.exam.findUnique({ where: { id }, include: { session: true, papers: { include: { results: { include: { components: true, student: { include: { application: true } } }, orderBy: { student: { application: { studentName: "asc" } } } } } } } });
  if (!exam) return NextResponse.json({ error: "Examination not found" }, { status: 404 });
  const paperReadiness = await Promise.all(exam.papers.map(paper => getPaperReadiness(paper, exam.sessionId)));
  const publicationErrors = exam.status === "PUBLISHED" ? [] : await validatePublication(id, exam.sessionId);
  return NextResponse.json({ ...exam, publicationReady: publicationErrors.length === 0, publicationErrors: publicationErrors.slice(0, 20), paperReadiness });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!adminRoles.has(user.role)) return NextResponse.json({ error: "Only administrators can change examination status" }, { status: 403 });
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const current = await prisma.exam.findUnique({ where: { id }, include: { _count: { select: { papers: true } } } });
    if (!current) return NextResponse.json({ error: "Examination not found" }, { status: 404 });
    if (body.status && body.status !== current.status) {
      const allowed = allowedTransitions[current.status] || [];
      if (!allowed.includes(body.status)) return NextResponse.json({ error: `Invalid examination status transition: ${current.status} → ${body.status}` }, { status: 400 });
      if (body.status === "PUBLISHED") {
        const publicationErrors = await validatePublication(id, current.sessionId);
        if (publicationErrors.length) return NextResponse.json({ error: "Examination is not ready for publication", details: publicationErrors.slice(0, 20) }, { status: 409 });
      }
      if (current.status === "PUBLISHED" && body.status === "SCHEDULED" && await hasAnyReportCardRelease(current.sessionId)) {
        return NextResponse.json({ error: "This examination cannot be unpublished because an official report card has already been released for this academic session." }, { status: 409 });
      }
    }
    const startDate = body.startDate ? new Date(body.startDate) : current.startDate;
    const endDate = body.endDate ? new Date(body.endDate) : current.endDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return NextResponse.json({ error: "Invalid examination dates" }, { status: 400 });
    const exam = await prisma.exam.update({ where: { id }, data: { name: body.name, status: body.status, startDate, endDate }, include: { session: true, _count: { select: { papers: true } } } });
    if (body.status && body.status !== current.status) await writeAuditLog({ userId: user.id, action: body.status === "PUBLISHED" ? "EXAM_PUBLISHED" : "EXAM_UNPUBLISHED", entityType: "Exam", entityId: exam.id, metadata: { from: current.status, to: body.status, paperCount: current._count.papers }, context: requestAuditContext(req) });
    else if (body.name || body.startDate || body.endDate) await writeAuditLog({ userId: user.id, action: "EXAM_UPDATED", entityType: "Exam", entityId: exam.id, metadata: { nameChanged: Boolean(body.name), datesChanged: Boolean(body.startDate || body.endDate) }, context: requestAuditContext(req) });
    return NextResponse.json(exam);
  } catch (e) {
    return NextResponse.json({ error: e instanceof z.ZodError ? "Invalid examination update" : e instanceof Error ? e.message : "Unable to update examination" }, { status: 400 });
  }
}
