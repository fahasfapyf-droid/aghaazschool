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

async function authorize() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, [...ROLES])) return { response: NextResponse.json({ error: "You do not have permission to manage parent access links." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const result = await authorize();
  if (result.response) return result.response;
  try {
    const links = await prisma.$queryRawUnsafe<Array<{
      id: string;
      enrollmentId: string;
      studentName: string;
      guardianName: string;
      guardianPhone: string | null;
      guardianEmail: string | null;
      expiresAt: Date;
      lastUsedAt: Date | null;
      createdAt: Date;
    }>>(`SELECT p."id",p."enrollmentId",a."studentName",a."guardianName",a."guardianPhone",a."guardianEmail",p."expiresAt",p."lastUsedAt",p."createdAt"
      FROM "ParentAccessToken" p
      JOIN "Enrollment" e ON e."id"=p."enrollmentId"
      JOIN "Application" a ON a."id"=e."applicationId"
      WHERE p."revokedAt" IS NULL AND p."expiresAt">NOW()
      ORDER BY p."createdAt" DESC LIMIT 200`);
    return NextResponse.json({ links });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load parent access links." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await authorize();
  if (result.response) return result.response;
  try {
    const body = await request.json();
    const enrollmentId = String(body.enrollmentId || "").trim();
    if (!enrollmentId) return NextResponse.json({ error: "Enrollment id is required." }, { status: 400 });

    const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { application: true } });
    if (!enrollment) return NextResponse.json({ error: "Enrollment not found." }, { status: 404 });
    if (!enrollment.application.guardianName?.trim()) return NextResponse.json({ error: "This student does not have a guardian name." }, { status: 400 });

    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`UPDATE "ParentAccessToken" SET "revokedAt"=NOW() WHERE "enrollmentId"=$1 AND "revokedAt" IS NULL`, enrollmentId);
      await tx.$executeRawUnsafe(`INSERT INTO "ParentAccessToken" ("id","enrollmentId","tokenHash","expiresAt","createdBy","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())`, id, enrollmentId, hashToken(token), expiresAt, result.user.id);
    });
    await writeAuditLog({ userId: result.user.id, action: "PARENT_ACCESS_LINK_CREATED", entityType: "Enrollment", entityId: enrollmentId, metadata: { expiresAt, guardianName: enrollment.application.guardianName }, context: requestAuditContext(request) });

    const origin = request.nextUrl.origin;
    return NextResponse.json({ accessUrl: `${origin}/parent#token=${encodeURIComponent(token)}`, expiresAt, guardianName: enrollment.application.guardianName, studentName: enrollment.application.studentName });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create parent access link." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const result = await authorize();
  if (result.response) return result.response;
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim().toUpperCase();
    if (!id || action !== "REVOKE") return NextResponse.json({ error: "Link id and REVOKE action are required." }, { status: 400 });

    const updated = await prisma.$queryRawUnsafe<Array<{ id: string; enrollmentId: string }>>(`UPDATE "ParentAccessToken" SET "revokedAt"=NOW() WHERE "id"=$1 AND "revokedAt" IS NULL RETURNING "id","enrollmentId"`, id);
    if (!updated.length) return NextResponse.json({ error: "Active parent access link not found." }, { status: 404 });

    await writeAuditLog({ userId: result.user.id, action: "PARENT_ACCESS_LINK_REVOKED", entityType: "Enrollment", entityId: updated[0].enrollmentId, metadata: { tokenId: id }, context: requestAuditContext(request) });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to revoke parent access link." }, { status: 500 });
  }
}
