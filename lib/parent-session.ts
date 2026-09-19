import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const PARENT_SESSION_COOKIE = "aghaaz_parent_session";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type ParentSession = {
  tokenId: string;
  enrollmentId: string;
  applicationId: string;
  studentName: string;
  guardianName: string;
};

export async function getParentSession(): Promise<ParentSession | null> {
  const token = (await cookies()).get(PARENT_SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await prisma.$queryRawUnsafe<ParentSession[]>(`
    SELECT p."id" AS "tokenId", p."enrollmentId", a."id" AS "applicationId",
           a."studentName", a."guardianName"
    FROM "ParentAccessToken" p
    JOIN "Enrollment" e ON e."id"=p."enrollmentId"
    JOIN "Application" a ON a."id"=e."applicationId"
    WHERE p."tokenHash"=$1
      AND p."revokedAt" IS NULL
      AND p."expiresAt">NOW()
      AND e."status" IN ('ACTIVE','ENROLLED','active','enrolled')
    LIMIT 1
  `, hashToken(token));

  if (!rows.length) return null;
  await prisma.$executeRawUnsafe(
    `UPDATE "ParentAccessToken" SET "lastUsedAt"=NOW() WHERE "id"=$1`,
    rows[0].tokenId,
  );
  return rows[0];
}
