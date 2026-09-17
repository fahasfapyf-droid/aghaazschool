import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const COOKIE = "aghaaz_parent_session";
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
async function getEnrollment() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ enrollmentId: string }>>(`SELECT p."enrollmentId" FROM "ParentAccessToken" p JOIN "Enrollment" e ON e."id"=p."enrollmentId" WHERE p."tokenHash"=$1 AND p."revokedAt" IS NULL AND p."expiresAt">NOW() AND e."status" NOT IN ('WITHDRAWN','TRANSFERRED') LIMIT 1`, hashToken(token));
  return rows[0]?.enrollmentId || null;
}
export async function GET() {
  const enrollmentId = await getEnrollment();
  if (!enrollmentId) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const releases = await prisma.reportCardRelease.findMany({ where: { studentId: enrollmentId }, include: { session: true }, orderBy: { releasedAt: "desc" }, take: 20 });
    return NextResponse.json({ reportCards: releases.map(release => ({ id: release.id, sessionId: release.sessionId, sessionName: release.session.name, releasedAt: release.releasedAt, snapshot: release.snapshot })) });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load report cards." }, { status: 500 }); }
}
