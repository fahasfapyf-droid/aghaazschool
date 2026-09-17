-- Preserve current enrollment structure on the enrollment row and keep an immutable lifecycle trail.
ALTER TABLE "Enrollment"
  ADD COLUMN "academicSessionId" TEXT,
  ADD COLUMN "academicGradeId" TEXT,
  ADD COLUMN "academicSectionId" TEXT;

CREATE INDEX "Enrollment_academicSessionId_idx" ON "Enrollment"("academicSessionId");
CREATE INDEX "Enrollment_academicGradeId_idx" ON "Enrollment"("academicGradeId");
CREATE INDEX "Enrollment_academicSectionId_idx" ON "Enrollment"("academicSectionId");

CREATE TABLE "EnrollmentHistory" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "academicSessionId" TEXT,
  "academicSessionName" TEXT,
  "academicGradeId" TEXT,
  "academicGradeName" TEXT,
  "academicSectionId" TEXT,
  "academicSectionName" TEXT,
  "className" TEXT NOT NULL,
  "section" TEXT,
  "status" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrollmentHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnrollmentHistory_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EnrollmentHistory_enrollmentId_effectiveAt_idx" ON "EnrollmentHistory"("enrollmentId", "effectiveAt");
CREATE INDEX "EnrollmentHistory_action_effectiveAt_idx" ON "EnrollmentHistory"("action", "effectiveAt");
CREATE INDEX "EnrollmentHistory_academicSessionId_idx" ON "EnrollmentHistory"("academicSessionId");
