CREATE TABLE "AcademicTermRecord" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "termKey" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicTermRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicTermRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicTermRecord_sessionId_termKey_key" ON "AcademicTermRecord"("sessionId", "termKey");
CREATE INDEX "AcademicTermRecord_sessionId_status_idx" ON "AcademicTermRecord"("sessionId", "status");

CREATE TABLE "AcademicGrade" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicGrade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicGrade_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AcademicSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicGrade_sessionId_code_key" ON "AcademicGrade"("sessionId", "code");
CREATE INDEX "AcademicGrade_sessionId_displayOrder_idx" ON "AcademicGrade"("sessionId", "displayOrder");

CREATE TABLE "AcademicSection" (
  "id" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER,
  "classTeacherStaffId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicSection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicSection_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "AcademicGrade"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicSection_classTeacherStaffId_fkey" FOREIGN KEY ("classTeacherStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicSection_gradeId_name_key" ON "AcademicSection"("gradeId", "name");
CREATE INDEX "AcademicSection_gradeId_active_idx" ON "AcademicSection"("gradeId", "active");

CREATE TABLE "AcademicSubject" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicSubject_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AcademicSubject_code_key" ON "AcademicSubject"("code");
CREATE INDEX "AcademicSubject_active_name_idx" ON "AcademicSubject"("active", "name");

CREATE TABLE "AcademicClassSubject" (
  "id" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "termId" TEXT,
  "teacherStaffId" TEXT,
  "maxMarks" DECIMAL(8,2),
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicClassSubject_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicClassSubject_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "AcademicGrade"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicClassSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "AcademicSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicClassSubject_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AcademicTermRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicClassSubject_teacherStaffId_fkey" FOREIGN KEY ("teacherStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AcademicClassSubject_grade_subject_term_key" ON "AcademicClassSubject"("gradeId", "subjectId", "termId");
CREATE INDEX "AcademicClassSubject_grade_term_order_idx" ON "AcademicClassSubject"("gradeId", "termId", "displayOrder");

CREATE TABLE "AcademicClassTeacher" (
  "id" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endDate" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicClassTeacher_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AcademicClassTeacher_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "AcademicSection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AcademicClassTeacher_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AcademicClassTeacher_section_active_idx" ON "AcademicClassTeacher"("sectionId", "active");
CREATE INDEX "AcademicClassTeacher_staff_active_idx" ON "AcademicClassTeacher"("staffId", "active");

ALTER TABLE "Enrollment" ADD COLUMN "academicGradeId" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "academicSectionId" TEXT;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_academicGradeId_fkey" FOREIGN KEY ("academicGradeId") REFERENCES "AcademicGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_academicSectionId_fkey" FOREIGN KEY ("academicSectionId") REFERENCES "AcademicSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Enrollment_academicGradeId_academicSectionId_idx" ON "Enrollment"("academicGradeId", "academicSectionId");
