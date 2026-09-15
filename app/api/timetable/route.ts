import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const entrySchema = z.object({
  dayOfWeek: z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]),
  className: z.string().trim().min(1).max(80),
  section: z.string().trim().max(20).optional().nullable(),
  subject: z.string().trim().min(1).max(100),
  teacher: z.string().trim().min(1).max(100),
  room: z.string().trim().max(50).optional().nullable(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  period: z.coerce.number().int().min(1).max(20),
});

export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const className = params.get("class")?.trim();
  const dayOfWeek = params.get("day")?.trim();
  const entries = await prisma.timetableEntry.findMany({
    where: {
      ...(className ? { className: { equals: className, mode: "insensitive" } } : {}),
      ...(dayOfWeek ? { dayOfWeek: dayOfWeek as never } : {}),
    },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });
  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  try {
    const body = entrySchema.parse(await request.json());
    if (body.endTime <= body.startTime) return NextResponse.json({ error: "End time must be after start time." }, { status: 400 });
    const entry = await prisma.timetableEntry.create({ data: body });
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid timetable entry.", details: error.flatten() }, { status: 400 });
    return NextResponse.json({ error: "Unable to create timetable entry." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Entry id is required." }, { status: 400 });
    const body = entrySchema.partial().parse(await request.json());
    const entry = await prisma.timetableEntry.update({ where: { id }, data: body });
    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid timetable entry." }, { status: 400 });
    return NextResponse.json({ error: "Unable to update timetable entry." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Entry id is required." }, { status: 400 });
  await prisma.timetableEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
