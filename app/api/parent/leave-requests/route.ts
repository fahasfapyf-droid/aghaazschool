import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";

const COOKIE = "aghaaz_parent_session";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ enrollmentId: string }>>(`SELECT p."enrollmentId" FROM "ParentAccessToken" p JOIN "Enrollment" e ON e."id"=p."enrollmentId" WHERE p."tokenHash"=$1 AND p."revokedAt" IS NULL AND p."expiresAt">NOW() AND e."status" NOT IN ('WITHDRAWN','TRANSFERRED') LIMIT 1`, hashToken(token));
  return rows[0] || null;
}

export async function GET() {
  const current = await getSession();
  if (!current) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  const rows = await prisma.leaveRequest.findMany({ where: { studentId: current.enrollmentId }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ requests: rows });
}

export async function POST(request: NextRequest) {
  const current = await getSession();
  if (!current) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const body = await request.json();
    const startDate = String(body.startDate || "").trim();
    const endDate = String(body.endDate || "").trim();
    const reason = String(body.reason || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return NextResponse.json({ error: "Valid start and end dates are required." }, { status: 400 });
    if (endDate < startDate) return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
    if (reason.length < 5 || reason.length > 500) return NextResponse.json({ error: "Reason must be between 5 and 500 characters." }, { status: 400 });

    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);
    const duplicate = await prisma.leaveRequest.findFirst({ where: { studentId: current.enrollmentId, status: "PENDING", startDate: { lte: end }, endDate: { gte: start } } });
    if (duplicate) return NextResponse.json({ error: "A pending leave request already covers part of these dates." }, { status: 409 });

    const row = await prisma.leaveRequest.create({ data: { studentId: current.enrollmentId, startDate: start, endDate: end, reason, status: "PENDING" } });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to submit leave request." }, { status: 500 });
  }
}
