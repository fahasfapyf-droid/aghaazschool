import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const componentSchema = z.object({
  name: z.string().trim().min(1),
  maxMarks: z.coerce.number().positive(),
  marks: z.coerce.number().min(0)
});

const resultSchema = z.object({
  paperId: z.string(),
  studentId: z.string(),
  marks: z.coerce.number().min(0).optional(),
  components: z.array(componentSchema).optional(),
  remarks: z.string().trim().max(2000).optional()
});

function grade(marks: number, max: number) {
  const percentage = max ? marks / max * 100 : 0;
  if (marks <= 0) return null;
  if (percentage >= 90) return "A_PLUS";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B_PLUS";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 40) return "D";
  return "TRY_AGAIN";
}

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get("studentId") || undefined;
  const examId = req.nextUrl.searchParams.get("examId") || undefined;
  const results = await prisma.result.findMany({
    where: { ...(studentId ? { studentId } : {}), ...(examId ? { paper: { examId } } : {}) },
    include: { components: true, student: { include: { application: true } }, paper: { include: { exam: true } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(results);
}

export async function POST(req: NextRequest) {
  try {
    const body = resultSchema.parse(await req.json());
    const paper = await prisma.examPaper.findUnique({ where: { id: body.paperId }, include: { exam: true } });
    if (!paper) return NextResponse.json({ error: "Exam paper not found" }, { status: 404 });

    const student = await prisma.enrollment.findUnique({ where: { id: body.studentId } });
    if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    if (student.className !== paper.className) {
      return NextResponse.json({ error: "Student is not enrolled in this paper's class" }, { status: 400 });
    }

    const maxMarks = Number(paper.maxMarks);
    let marks = body.marks ?? 0;
    const components = body.components;

    if (components?.length) {
      const componentMax = components.reduce((sum, c) => sum + c.maxMarks, 0);
      const componentMarks = components.reduce((sum, c) => sum + c.marks, 0);
      if (Math.abs(componentMax - maxMarks) > 0.01) {
        return NextResponse.json({ error: `Component maximum must total ${maxMarks}` }, { status: 400 });
      }
      if (components.some(c => c.marks > c.maxMarks)) {
        return NextResponse.json({ error: "Component marks cannot exceed their maximum" }, { status: 400 });
      }
      marks = componentMarks;
    }

    if (marks > maxMarks) {
      return NextResponse.json({ error: `Marks cannot exceed ${maxMarks}` }, { status: 400 });
    }

    const result = await prisma.result.upsert({
      where: { paperId_studentId: { paperId: body.paperId, studentId: body.studentId } },
      create: {
        paperId: body.paperId,
        studentId: body.studentId,
        marks,
        grade: grade(marks, maxMarks),
        remarks: body.remarks,
        components: components?.length ? { create: components.map(c => ({ name: c.name, maxMarks: c.maxMarks, marks: c.marks })) } : undefined
      },
      update: {
        marks,
        grade: grade(marks, maxMarks),
        remarks: body.remarks,
        components: components ? {
          deleteMany: {},
          create: components.map(c => ({ name: c.name, maxMarks: c.maxMarks, marks: c.marks }))
        } : undefined
      },
      include: { components: true, paper: true }
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof z.ZodError ? "Invalid result data" : e instanceof Error ? e.message : "Unable to save result" }, { status: 400 });
  }
}
