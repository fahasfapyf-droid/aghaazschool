import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") || undefined;
    const rows = await prisma.leaveRequest.findMany({
      where: status ? { status } : undefined,
      include: { student: { include: { application: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(rows);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load leave requests." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.studentId || !body.startDate || !body.endDate || !body.reason?.trim()) {
      return NextResponse.json({ error: "Student, dates and reason are required." }, { status: 400 });
    }
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      return NextResponse.json({ error: "End date must be on or after the start date." }, { status: 400 });
    }
    const student = await prisma.enrollment.findUnique({ where: { id: body.studentId } });
    if (!student) return NextResponse.json({ error: "Student enrollment not found." }, { status: 404 });

    const row = await prisma.leaveRequest.create({
      data: { studentId: body.studentId, startDate, endDate, reason: body.reason.trim(), status: "PENDING" },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create leave request." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const status = body.status === "APPROVED" || body.status === "REJECTED" ? body.status : null;
    if (!body.id || !status) return NextResponse.json({ error: "Request id and a valid review status are required." }, { status: 400 });

    const existing = await prisma.leaveRequest.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Leave request not found." }, { status: 404 });
    if (existing.status !== "PENDING") return NextResponse.json({ error: "Only pending requests can be reviewed." }, { status: 409 });

    const row = await prisma.leaveRequest.update({
      where: { id: body.id },
      data: {
        status,
        reviewedBy: typeof body.reviewedBy === "string" ? body.reviewedBy.trim() || null : null,
        reviewedAt: new Date(),
        reviewRemarks: typeof body.reviewRemarks === "string" ? body.reviewRemarks.trim() || null : null,
      },
    });
    return NextResponse.json(row);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to review leave request." }, { status: 500 });
  }
}
