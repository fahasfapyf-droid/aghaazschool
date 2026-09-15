import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
});

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      session: true,
      papers: {
        include: {
          results: {
            include: { components: true, student: { include: { application: true } } },
            orderBy: { student: { application: { studentName: "asc" } } }
          }
        }
      }
    }
  });
  if (!exam) return NextResponse.json({ error: "Examination not found" }, { status: 404 });
  return NextResponse.json(exam);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const exam = await prisma.exam.update({
      where: { id },
      data: {
        name: body.name,
        status: body.status,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined
      }
    });
    return NextResponse.json(exam);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to update examination" }, { status: 400 });
  }
}
