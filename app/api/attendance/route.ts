import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  date: z.string().optional(),
  records: z.array(z.object({ studentId: z.string().min(1), status: z.enum(["PRESENT","ABSENT","LATE","EXCUSED"]), remarks: z.string().max(300).optional() })).min(1),
});

function bounds(value?: string) { const d = value ? new Date(value) : new Date(); const start = new Date(d); start.setHours(0,0,0,0); const end = new Date(d); end.setHours(23,59,59,999); return { start, end }; }

export async function GET(request: NextRequest) {
  try {
    const { start, end } = bounds(request.nextUrl.searchParams.get("date") || undefined);
    const records = await prisma.attendance.findMany({ where: { date: { gte: start, lte: end } }, include: { student: { include: { application: true } } }, orderBy: { student: { application: { studentName: "asc" } } } });
    return NextResponse.json(records);
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load attendance" }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid attendance data", details: parsed.error.flatten() }, { status: 400 });
    const d = parsed.data.date ? new Date(parsed.data.date) : new Date(); const day = new Date(d); day.setHours(0,0,0,0);
    const result = await prisma.$transaction(parsed.data.records.map(r => prisma.attendance.upsert({ where: { studentId_date: { studentId: r.studentId, date: day } }, update: { status: r.status, remarks: r.remarks }, create: { studentId: r.studentId, date: day, status: r.status, remarks: r.remarks } })));
    return NextResponse.json(result, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to save attendance" }, { status: 500 }); }
}
