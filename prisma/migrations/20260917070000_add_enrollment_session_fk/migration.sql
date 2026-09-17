-- Complete the Prisma relation for the academic session carried by an enrollment.
ALTER TABLE "Enrollment"
  ADD CONSTRAINT "Enrollment_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
