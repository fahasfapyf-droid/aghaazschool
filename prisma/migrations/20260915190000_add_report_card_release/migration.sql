CREATE TABLE "ReportCardRelease" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "releasedBy" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportCardRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportCardRelease_studentId_sessionId_key" ON "ReportCardRelease"("studentId", "sessionId");
CREATE INDEX "ReportCardRelease_sessionId_releasedAt_idx" ON "ReportCardRelease"("sessionId", "releasedAt");
CREATE INDEX "ReportCardRelease_studentId_releasedAt_idx" ON "ReportCardRelease"("studentId", "releasedAt");
