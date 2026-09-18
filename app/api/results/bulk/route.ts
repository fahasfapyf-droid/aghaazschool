import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { hasReportCardRelease } from "@/lib/report-card-release";
import { getGradingBands, gradingLabelToEnum, resolveGrade } from "@/lib/grading";

const componentSchema = z.object({ name: z.string().trim().min(1), maxMarks: z.coerce.number().positive(), marks: z.coerce.number().min(0) });
const entrySchema = z.object({ studentId: z.string().min(1), marks: z.coerce.number().min(0).optional(), components: z.array(componentSchema).optional(), remarks: z.string().trim().max(2000).optional() }).refine(entry => entry.marks !== undefined || entry.components !== undefined, { message: "Marks or assessment components are required" });
const bulkSchema = z.object({ paperId: z.string().min(1), entries: z.array(entrySchema).min(1).max(200) });
function canEnterResults(role?: string) { return role === "SUPER_ADMIN" || role === "ADMIN" || role === "TEACHER"; }

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!canEnterResults(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = bulkSchema.parse(await req.json());
    const paper = await prisma.examPaper.findUnique({ where: { id: body.paperId }, include: { exam: true } });
    if (!paper) return NextResponse.json({ error: "Exam paper not found" }, { status: 404 });
    if (paper.exam.status === "PUBLISHED") return NextResponse.json({ error: "This examination is published and its results are locked. An administrator must unpublish it before corrections can be made." }, { status: 409 });

    const studentIds = [...new Set(body.entries.map(entry => entry.studentId))];
    if (studentIds.length !== body.entries.length) return NextResponse.json({ error: "Each student may appear only once in a bulk submission" }, { status: 400 });
    const students = await prisma.enrollment.findMany({ where: { id: { in: studentIds }, status: "active" }, select: { id: true, className: true, section: true, application: { select: { sessionId: true } } } });
    if (students.length !== studentIds.length) return NextResponse.json({ error: "One or more students are not active or were not found" }, { status: 400 });
    if (students.some(student => student.className !== paper.className)) return NextResponse.json({ error: "All selected students must belong to the paper's class" }, { status: 400 });
    if (students.some(student => student.application.sessionId !== paper.exam.sessionId)) return NextResponse.json({ error: "All selected students must belong to the examination's academic session" }, { status: 400 });
    const releasedStudents = await Promise.all(students.map(async student => ({ id: student.id, released: await hasReportCardRelease(student.id, student.application.sessionId) })));
    const blocked = releasedStudents.filter(student => student.released).map(student => student.id);
    if (blocked.length) return NextResponse.json({ error: "One or more selected students have officially released report cards and cannot be modified", studentIds: blocked }, { status: 409 });

    const studentMap = new Map(students.map(student => [student.id, student]));
    const maxMarks = Number(paper.maxMarks);
    const gradingBands = await getGradingBands(paper.exam.sessionId);
    const sectionSet = new Set(students.map(student => student.section || ""));
    if (sectionSet.size > 1) return NextResponse.json({ error: "Bulk submission cannot mix students from different sections" }, { status: 400 });
    const section = students[0]?.section || null;

    let configured = null;
    if (paper.exam.term) {
      const configs = await prisma.reportCardSubject.findMany({ where: { sessionId: paper.exam.sessionId, className: paper.className, term: paper.exam.term, subject: paper.subject, active: true, OR: [{ section }, { section: null }] }, include: { components: { orderBy: { displayOrder: "asc" } } } });
      configured = configs.find(item => item.section === section) || configs.find(item => item.section === null) || null;
    }
    if (configured && Math.abs(Number(configured.maxMarks) - maxMarks) > 0.01) return NextResponse.json({ error: `Exam paper maximum (${maxMarks}) does not match configured maximum (${configured.maxMarks})` }, { status: 400 });
    const configuredComponents = configured?.components ?? [];

    for (const entry of body.entries) {
      const components = entry.components;
      if (configuredComponents.length && !components?.length) return NextResponse.json({ error: "This subject requires assessment component marks for every submitted student" }, { status: 400 });
      if (components?.length) {
        const names = components.map(component => component.name.toLowerCase());
        if (new Set(names).size !== names.length) return NextResponse.json({ error: "Assessment component names must be unique" }, { status: 400 });
        const componentMax = components.reduce((sum, component) => sum + component.maxMarks, 0);
        const componentMarks = components.reduce((sum, component) => sum + component.marks, 0);
        if (Math.abs(componentMax - maxMarks) > 0.01) return NextResponse.json({ error: `Component maximum must total ${maxMarks}` }, { status: 400 });
        if (components.some(component => component.marks > component.maxMarks)) return NextResponse.json({ error: "Component marks cannot exceed their maximum" }, { status: 400 });
        if (configuredComponents.length) {
          if (components.length !== configuredComponents.length) return NextResponse.json({ error: "Submitted assessment components do not match the configured subject" }, { status: 400 });
          const configuredByName = new Map(configuredComponents.map(component => [component.name.toLowerCase(), Number(component.maxMarks)]));
          for (const component of components) { const configuredMax = configuredByName.get(component.name.toLowerCase()); if (configuredMax === undefined || Math.abs(configuredMax - component.maxMarks) > 0.01) return NextResponse.json({ error: `Assessment component '${component.name}' does not match the configured subject` }, { status: 400 }); }
        }
        if (componentMarks > maxMarks) return NextResponse.json({ error: `Marks cannot exceed ${maxMarks}` }, { status: 400 });
      } else if ((entry.marks ?? 0) > maxMarks) return NextResponse.json({ error: `Marks cannot exceed ${maxMarks}` }, { status: 400 });
      if (!studentMap.has(entry.studentId)) return NextResponse.json({ error: "Invalid student in submission" }, { status: 400 });
    }

    const results = await prisma.$transaction(async tx => {
      const saved = [];
      for (const entry of body.entries) {
        const components = entry.components;
        const marks = components?.length ? components.reduce((sum, component) => sum + component.marks, 0) : entry.marks!;
        const result = await tx.result.upsert({ where: { paperId_studentId: { paperId: body.paperId, studentId: entry.studentId } }, create: { paperId: body.paperId, studentId: entry.studentId, marks, grade: gradingLabelToEnum(resolveGrade(gradingBands, maxMarks ? (marks / maxMarks) * 100 : 0)) as never, remarks: entry.remarks, components: components?.length ? { create: components.map(component => ({ name: component.name, maxMarks: component.maxMarks, marks: component.marks })) } : undefined }, update: { marks, grade: grade(marks, maxMarks), remarks: entry.remarks, components: components ? { deleteMany: {}, create: components.map(component => ({ name: component.name, maxMarks: component.maxMarks, marks: component.marks })) } : undefined }, select: { id: true, studentId: true, marks: true, grade: true } });
        saved.push(result);
      }
      return saved;
    });

    await writeAuditLog({ userId: user.id, action: "RESULT_BULK_SAVED", entityType: "ExamPaper", entityId: paper.id, metadata: { examId: paper.examId, subject: paper.subject, className: paper.className, section, count: results.length, resultIds: results.map(result => result.id) }, context: requestAuditContext(req) });
    return NextResponse.json({ saved: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid bulk result data" : error instanceof Error ? error.message : "Unable to save class results" }, { status: 400 });
  }
}
