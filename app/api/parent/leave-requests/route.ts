import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentSession } from "@/lib/parent-session";

export async function GET() {
  const current = await getParentSession();
  if (!current) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  const rows = await prisma.leaveRequest.findMany({
    where: { studentId: current.enrollmentId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ requests: rows });
}

export async function POST(request: NextRequest) {
  const current = await getParentSession();
  if (!current) return NextResponse.json({ error: "Parent session required." }, { status: 401 });

  try {
    const body = await request.json();
    const startDate = String(body.startDate || "").trim();
    const endDate = String(body.endDate || "").trim();
    const reason = String(body.reason || "").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      return NextResponse.json({ error: "Valid start and end dates are required." }, { status: 400 });
    }
    if (endDate < startDate) return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
    if (reason.length < 5 || reason.length > 500) {
      return NextResponse.json({ error: "Reason must be between 5 and 500 characters." }, { status: 400 });
    }

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    const row = await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe(
        `SELECT "id" FROM "Enrollment" WHERE "id"=$1 AND "status" IN ('ACTIVE','ENROLLED','active','enrolled') FOR UPDATE`,
        current.enrollmentId,
      );

      const duplicate = await tx.leaveRequest.findFirst({
        where: {
          studentId: current.enrollmentId,
          status: "PENDING",
          startDate: { lte: end },
          endDate: { gte: start },
        },
      });
      if (duplicate) throw new Error("PENDING_LEAVE_OVERLAP");

      return tx.leaveRequest.create({
        data: {
          studentId: current.enrollmentId,
          startDate: start,
          endDate: end,
          reason,
          status: "PENDING",
        },
      });
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PENDING_LEAVE_OVERLAP") {
      return NextResponse.json({ error: "A pending leave request already covers part of these dates." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Unable to submit leave request." }, { status: 500 });
  }
}
