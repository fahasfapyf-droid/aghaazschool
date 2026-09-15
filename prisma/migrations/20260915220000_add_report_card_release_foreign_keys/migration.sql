ALTER TABLE "ReportCardRelease"
  ADD CONSTRAINT "ReportCardRelease_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportCardRelease"
  ADD CONSTRAINT "ReportCardRelease_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportCardRelease"
  ADD CONSTRAINT "ReportCardRelease_releasedBy_fkey"
  FOREIGN KEY ("releasedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
