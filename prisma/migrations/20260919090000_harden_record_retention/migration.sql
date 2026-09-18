-- Reconcile the existing gradeLabel column with the Prisma model without
-- failing on databases that already contain the grading-engine migration.
ALTER TABLE "Result" ADD COLUMN IF NOT EXISTS "gradeLabel" TEXT;

-- Preserve financial, academic, and lifecycle records if an enrollment is
-- ever targeted for deletion. These records must not disappear implicitly.
ALTER TABLE "FeeInvoice" DROP CONSTRAINT IF EXISTS "FeeInvoice_studentId_fkey";
ALTER TABLE "Result" DROP CONSTRAINT IF EXISTS "Result_studentId_fkey";
ALTER TABLE "EnrollmentHistory" DROP CONSTRAINT IF EXISTS "EnrollmentHistory_enrollmentId_fkey";

ALTER TABLE "FeeInvoice"
  ADD CONSTRAINT "FeeInvoice_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Result"
  ADD CONSTRAINT "Result_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnrollmentHistory"
  ADD CONSTRAINT "EnrollmentHistory_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
