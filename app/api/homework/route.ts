import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const homeworkSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(1).max(5000),
  className: z.string().trim().min(1).max(80),
  section: z.string().trim().max(20).optional().nullable(),
  subject: z.string().trim().min(1).max(100),
  teacher: z.string().trim().min(1).max(100),
  assignedDate: z.coerce.date().optional(),
  dueDate: z.coerce.date(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
});

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const className = params.get("class")?.trim();
  const status = params.get("status")?.trim();
  const items = await prisma.homework.findMany({
    where: {
      ...(className ? { className: { equals: className, mode: "insensitive" } } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: { _count: { select: { submissions: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  try {
    const body = homeworkSchema.parse(await request.json());
    const assignedDate = body.assignedDate ?? new Date();
    if (body.dueDate < assignedDate) return NextResponse.json({ error: "Due date cannot be before assigned date." }, { status: 400 });
    const item = await prisma.homework.create({ data: { ...body, assignedDate } });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid homework details.", details: error.flatten() }, { status: 400 });
    return NextResponse.json({ error: "Unable to create homework." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Homework id is required." }, { status: 400 });
    const body = homeworkSchema.partial().parse(await request.json());
    const item = await prisma.homework.update({ where: { id }, data: body });
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid homework details." }, { status: 400 });
    return NextResponse.json({ error: "Unable to update homework." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Homework id is required." }, { status: 400 });
  await prisma.homework.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
