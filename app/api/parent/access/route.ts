import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const TOKEN_TTL_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "You do not have permission to create parent access links." }, { status: 403 });
  try {
    const body = await request.json();
    const enrollmentId = String(body.enrollmentId || "").trim();
    if (!enrollmentId) return NextResponse.json({ error: "Enrollment id is required." }, { status: 400 });

    const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { application: true } });
    if (!enrollment) return NextResponse.json({ error: "Enrollment not found." }, { status: 404 });
    if (!enrollment.application.guardianName?.trim()) return NextResponse.json({ error: "This student does not have a guardian name." }, { status: 400 });

    await prisma.$executeRawUnsafe(`UPDATE "ParentAccessToken" SET "revokedAt"=NOW() WHERE "enrollmentId"=$1 AND "revokedAt" IS NULL`, enrollmentId);
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.$executeRawUnsafe(`INSERT INTO "ParentAccessToken" ("id","enrollmentId","tokenHash","expiresAt","createdBy","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())`, id, enrollmentId, hashToken(token), expiresAt, user.id);
    await writeAuditLog({ userId: user.id, action: "PARENT_ACCESS_LINK_CREATED", entityType: "Enrollment", entityId: enrollmentId, metadata: { expiresAt, guardianName: enrollment.application.guardianName }, context: requestAuditContext(request) });

    const origin = request.nextUrl.origin;
    return NextResponse.json({ accessUrl: `${origin}/parent/notifications#token=${encodeURIComponent(token)}`, expiresAt, guardianName: enrollment.application.guardianName, studentName: enrollment.application.studentName });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create parent access link." }, { status: 500 });
  }
}
