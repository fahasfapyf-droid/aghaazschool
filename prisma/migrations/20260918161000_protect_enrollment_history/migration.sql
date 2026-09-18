-- Preserve financial, academic, and lifecycle history if an enrollment is ever targeted for deletion.
ALTER TABLE "FeeInvoice" DROP CONSTRAINT "FeeInvoice_studentId_fkey";
ALTER TABLE "FeeInvoice"
  ADD CONSTRAINT "FeeInvoice_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Result" DROP CONSTRAINT "Result_studentId_fkey";
ALTER TABLE "Result"
  ADD CONSTRAINT "Result_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnrollmentHistory" DROP CONSTRAINT "EnrollmentHistory_enrollmentId_fkey";
ALTER TABLE "EnrollmentHistory"
  ADD CONSTRAINT "EnrollmentHistory_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
