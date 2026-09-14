import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const status = new URL(request.url).searchParams.get("status") || undefined;
    const rows = await prisma.leaveRequest.findMany({ where: status ? { status } : undefined, include: { student: { include: { application: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
    return NextResponse.json(rows);
  } catch { return NextResponse.json({ error: "Unable to load leave requests." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.studentId || !body.startDate || !body.endDate || !body.reason?.trim()) return NextResponse.json({ error: "Student, dates and reason are required." }, { status: 400 });
    const row = await prisma.leaveRequest.create({ data: { studentId: body.studentId, startDate: new Date(body.startDate), endDate: new Date(body.endDate), reason: body.reason.trim(), status: "PENDING" } });
    return NextResponse.json(row, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to create leave request." }, { status: 500 }); }
}
