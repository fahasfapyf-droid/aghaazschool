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
  return prisma.reportCardRelease.findUnique({
    where: { studentId_sessionId: { studentId, sessionId } },
    select: { id: true, studentId: true, sessionId: true, snapshot: true, snapshotHash: true, releasedBy: true, releasedAt: true },
  });
}

export async function hasReportCardRelease(studentId: string, sessionId: string) {
  const release = await prisma.reportCardRelease.findUnique({
    where: { studentId_sessionId: { studentId, sessionId } },
    select: { id: true },
  });
  return Boolean(release);
}

export async function hasAnyReportCardRelease(sessionId: string) {
  const release = await prisma.reportCardRelease.findFirst({
    where: { sessionId },
    select: { id: true },
  });
  return Boolean(release);
}

export async function createReportCardRelease(input: {
  studentId: string;
  sessionId: string;
  snapshot: unknown;
  snapshotHash: string;
  releasedBy: string;
}) {
  return prisma.reportCardRelease.create({
    data: {
      studentId: input.studentId,
      sessionId: input.sessionId,
      snapshot: input.snapshot as object,
      snapshotHash: input.snapshotHash,
      releasedBy: input.releasedBy,
    },
    select: { id: true, studentId: true, sessionId: true, snapshot: true, snapshotHash: true, releasedBy: true, releasedAt: true },
  });
}
