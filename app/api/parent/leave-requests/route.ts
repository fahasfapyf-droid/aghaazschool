import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE = "aghaaz_parent_session";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ tokenId: string; enrollmentId: string; applicationId: string }>>(`SELECT p."id" AS "tokenId",p."enrollmentId",a."id" AS "applicationId" FROM "ParentAccessToken" p JOIN "Enrollment" e ON e."id"=p."enrollmentId" JOIN "Application" a ON a."id"=e."applicationId" WHERE p."tokenHash"=$1 AND p."revokedAt" IS NULL AND p."expiresAt">NOW() AND e."status" NOT IN ('WITHDRAWN','TRANSFERRED') LIMIT 1`, hashToken(token));
  return rows[0] || null;
}

export async function GET() {
  const current = await getSession();
  if (!current) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  const rows = await prisma.$queryRawUnsafe(`SELECT "id","startDate","endDate","reason","status","reviewNote","reviewedAt","createdAt" FROM "ParentLeaveRequest" WHERE "enrollmentId"=$1 ORDER BY "createdAt" DESC LIMIT 50`, current.enrollmentId);
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

    const duplicate = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "ParentLeaveRequest" WHERE "enrollmentId"=$1 AND "status"='PENDING' AND "startDate" <= $3::date AND "endDate" >= $2::date LIMIT 1`, current.enrollmentId, startDate, endDate);
    if (duplicate.length) return NextResponse.json({ error: "A pending leave request already covers part of these dates." }, { status: 409 });

    const id = randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "ParentLeaveRequest" ("id","enrollmentId","startDate","endDate","reason","status","createdAt","updatedAt") VALUES ($1,$2,$3::date,$4::date,$5,'PENDING',NOW(),NOW())`, id, current.enrollmentId, startDate, endDate, reason);
    return NextResponse.json({ id, status: "PENDING" }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to submit leave request." }, { status: 500 });
  }
}
