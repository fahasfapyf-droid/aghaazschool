-- Link timetable entries to canonical academic entities while preserving
-- legacy text fields for compatibility and display.
ALTER TABLE "TimetableEntry"
  ADD COLUMN "academicSessionId" TEXT,
  ADD COLUMN "academicGradeId" TEXT,
  ADD COLUMN "academicSectionId" TEXT,
  ADD COLUMN "academicSubjectId" TEXT,
  ADD COLUMN "teacherStaffId" TEXT;

ALTER TABLE "TimetableEntry"
  ADD CONSTRAINT "TimetableEntry_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry"
  ADD CONSTRAINT "TimetableEntry_academicGradeId_fkey"
  FOREIGN KEY ("academicGradeId") REFERENCES "AcademicGrade"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry"
  ADD CONSTRAINT "TimetableEntry_academicSectionId_fkey"
  FOREIGN KEY ("academicSectionId") REFERENCES "AcademicSection"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry"
  ADD CONSTRAINT "TimetableEntry_academicSubjectId_fkey"
  FOREIGN KEY ("academicSubjectId") REFERENCES "AcademicSubject"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TimetableEntry"
  ADD CONSTRAINT "TimetableEntry_teacherStaffId_fkey"
  FOREIGN KEY ("teacherStaffId") REFERENCES "Staff"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TimetableEntry_academicSessionId_idx" ON "TimetableEntry"("academicSessionId");
CREATE INDEX "TimetableEntry_academicGradeId_academicSectionId_day_period_idx" ON "TimetableEntry"("academicGradeId", "academicSectionId", "dayOfWeek", "period");
CREATE INDEX "TimetableEntry_teacherStaffId_day_period_idx" ON "TimetableEntry"("teacherStaffId", "dayOfWeek", "period");
CREATE INDEX "TimetableEntry_academicSubjectId_idx" ON "TimetableEntry"("academicSubjectId");

-- Preserve the existing timetable exactly; legacy rows remain valid with null
-- canonical references and can be reconciled manually from the new UI.
