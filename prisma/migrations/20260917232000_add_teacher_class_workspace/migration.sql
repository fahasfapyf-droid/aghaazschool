CREATE TABLE "TeacherClassNote" (
  "id" TEXT NOT NULL,
  "timetableEntryId" TEXT NOT NULL,
  "teacherStaffId" TEXT NOT NULL,
  "noteDate" DATE NOT NULL,
  "topic" TEXT NOT NULL,
  "summary" TEXT,
  "followUp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeacherClassNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeacherClassNote_timetableEntryId_fkey" FOREIGN KEY ("timetableEntryId") REFERENCES "TimetableEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeacherClassNote_teacherStaffId_fkey" FOREIGN KEY ("teacherStaffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "TeacherClassNote_timetableEntryId_noteDate_key" UNIQUE ("timetableEntryId", "noteDate")
);
CREATE INDEX "TeacherClassNote_teacherStaffId_noteDate_idx" ON "TeacherClassNote"("teacherStaffId", "noteDate");
CREATE INDEX "TeacherClassNote_noteDate_idx" ON "TeacherClassNote"("noteDate");
