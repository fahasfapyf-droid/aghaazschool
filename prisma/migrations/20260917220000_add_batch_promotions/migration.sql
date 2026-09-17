CREATE TABLE "BatchPromotion" (
  "id" TEXT NOT NULL,
  "sourceSessionId" TEXT NOT NULL,
  "sourceGradeId" TEXT NOT NULL,
  "sourceSectionId" TEXT NOT NULL,
  "targetSessionId" TEXT NOT NULL,
  "targetGradeId" TEXT NOT NULL,
  "targetSectionId" TEXT NOT NULL,
  "studentCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatchPromotion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatchPromotion_source_idx" ON "BatchPromotion"("sourceSessionId", "sourceGradeId", "sourceSectionId", "createdAt");
CREATE INDEX "BatchPromotion_target_idx" ON "BatchPromotion"("targetSessionId", "targetGradeId", "targetSectionId", "createdAt");

ALTER TABLE "BatchPromotion"
  ADD CONSTRAINT "BatchPromotion_sourceSession_fkey" FOREIGN KEY ("sourceSessionId") REFERENCES "AcademicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchPromotion"
  ADD CONSTRAINT "BatchPromotion_sourceGrade_fkey" FOREIGN KEY ("sourceGradeId") REFERENCES "AcademicGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchPromotion"
  ADD CONSTRAINT "BatchPromotion_sourceSection_fkey" FOREIGN KEY ("sourceSectionId") REFERENCES "AcademicSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchPromotion"
  ADD CONSTRAINT "BatchPromotion_targetSession_fkey" FOREIGN KEY ("targetSessionId") REFERENCES "AcademicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchPromotion"
  ADD CONSTRAINT "BatchPromotion_targetGrade_fkey" FOREIGN KEY ("targetGradeId") REFERENCES "AcademicGrade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatchPromotion"
  ADD CONSTRAINT "BatchPromotion_targetSection_fkey" FOREIGN KEY ("targetSectionId") REFERENCES "AcademicSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BatchPromotionStudent" (
  "id" TEXT NOT NULL,
  "batchPromotionId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "grNumber" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "fromClassName" TEXT NOT NULL,
  "fromSection" TEXT,
  "toClassName" TEXT NOT NULL,
  "toSection" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BatchPromotionStudent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BatchPromotionStudent_batch_enrollment_key" ON "BatchPromotionStudent"("batchPromotionId", "enrollmentId");
CREATE INDEX "BatchPromotionStudent_enrollment_idx" ON "BatchPromotionStudent"("enrollmentId", "createdAt");
ALTER TABLE "BatchPromotionStudent"
  ADD CONSTRAINT "BatchPromotionStudent_batch_fkey" FOREIGN KEY ("batchPromotionId") REFERENCES "BatchPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BatchPromotionStudent"
  ADD CONSTRAINT "BatchPromotionStudent_enrollment_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
