CREATE TABLE "StudentBehaviourRecord" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'LOW',
  "title" TEXT NOT NULL,
  "description" TEXT,
  "actionTaken" TEXT,
  "followUpDue" TIMESTAMP(3),
  "followUpNote" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "parentNotified" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentBehaviourRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentBehaviourRecord_student_idx" ON "StudentBehaviourRecord"("enrollmentId", "occurredAt");
CREATE INDEX "StudentBehaviourRecord_status_idx" ON "StudentBehaviourRecord"("status", "severity", "occurredAt");
CREATE INDEX "StudentBehaviourRecord_followup_idx" ON "StudentBehaviourRecord"("followUpDue", "status");

ALTER TABLE "StudentBehaviourRecord"
  ADD CONSTRAINT "StudentBehaviourRecord_enrollment_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
