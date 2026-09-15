import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReportCardReleaseRecord = {
  id: string;
  studentId: string;
  sessionId: string;
  snapshot: unknown;
  snapshotHash: string;
  releasedBy: string;
  releasedAt: Date;
};

export async function findReportCardRelease(studentId: string, sessionId: string) {
  const rows = await prisma.$queryRaw<ReportCardReleaseRecord[]>(Prisma.sql`
    SELECT id, "studentId", "sessionId", snapshot, "snapshotHash", "releasedBy", "releasedAt"
    FROM "ReportCardRelease"
    WHERE "studentId" = ${studentId} AND "sessionId" = ${sessionId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function hasReportCardRelease(studentId: string, sessionId: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS(
      SELECT 1 FROM "ReportCardRelease"
      WHERE "studentId" = ${studentId} AND "sessionId" = ${sessionId}
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

export async function hasAnyReportCardRelease(sessionId: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    SELECT EXISTS(
      SELECT 1 FROM "ReportCardRelease"
      WHERE "sessionId" = ${sessionId}
    ) AS exists
  `);
  return Boolean(rows[0]?.exists);
}

export async function createReportCardRelease(input: {
  studentId: string;
  sessionId: string;
  snapshot: unknown;
  snapshotHash: string;
  releasedBy: string;
}) {
  const rows = await prisma.$queryRaw<ReportCardReleaseRecord[]>(Prisma.sql`
    INSERT INTO "ReportCardRelease" (id, "studentId", "sessionId", snapshot, "snapshotHash", "releasedBy", "releasedAt")
    VALUES (gen_random_uuid()::text, ${input.studentId}, ${input.sessionId}, ${JSON.stringify(input.snapshot)}::jsonb, ${input.snapshotHash}, ${input.releasedBy}, CURRENT_TIMESTAMP)
    RETURNING id, "studentId", "sessionId", snapshot, "snapshotHash", "releasedBy", "releasedAt"
  `);
  return rows[0];
}
