import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const examSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["MIDTERM", "FINAL", "QUIZ", "MONTHLY", "OTHER"]),
  term: z.enum(["FIRST", "SECOND", "THIRD"]).optional(),
  sessionId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]).optional(),
  papers: z.array(z.object({
    className: z.string().min(1),
    subject: z.string().min(1),
    maxMarks: z.coerce.number().positive(),
    passMarks: z.coerce.number().min(0),
    examDate: z.string().optional()
  })).default([])
});

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const exams = await prisma.exam.findMany({
    where: status ? { status: status as "DRAFT" | "SCHEDULED" | "PUBLISHED" } : undefined,
    include: { session: true, papers: { include: { _count: { select: { results: true } } }, orderBy: { examDate: "asc" } } },
    orderBy: { startDate: "desc" }
  });
  return NextResponse.json(exams);
}

export async function POST(req: NextRequest) {
  try {
    const body = examSchema.parse(await req.json());
    let sessionId = body.sessionId;
    if (!sessionId) {
      const session = await prisma.academicSession.findFirst({ orderBy: { startDate: "desc" } });
      if (!session) return NextResponse.json({ error: "Create an academic session first" }, { status: 400 });
      sessionId = session.id;
    }
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      return NextResponse.json({ error: "Invalid examination dates" }, { status: 400 });
    }
    const exam = await prisma.exam.create({
      data: {
        name: body.name,
        type: body.type,
        term: body.term,
        sessionId,
        startDate,
        endDate,
        status: body.status || "DRAFT",
        papers: {
          create: body.papers.map(p => ({
            className: p.className,
            subject: p.subject,
            maxMarks: p.maxMarks,
            passMarks: p.passMarks,
            examDate: p.examDate ? new Date(p.examDate) : undefined
          }))
        }
      },
      include: { session: true, papers: true }
    });
    return NextResponse.json(exam, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof z.ZodError ? "Invalid examination data" : e instanceof Error ? e.message : "Unable to create examination" }, { status: 400 });
  }
}
