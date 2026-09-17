CREATE TABLE "Curriculum" (
  "id" TEXT NOT NULL,
  "academicSessionId" TEXT NOT NULL,
  "academicGradeId" TEXT NOT NULL,
  "academicSubjectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Curriculum_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Curriculum_session_grade_subject_idx" ON "Curriculum"("academicSessionId","academicGradeId","academicSubjectId");
CREATE INDEX "Curriculum_status_idx" ON "Curriculum"("status");

CREATE TABLE "CurriculumTopic" (
  "id" TEXT NOT NULL,
  "curriculumId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "objectives" TEXT,
  "estimatedPeriods" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CurriculumTopic_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CurriculumTopic_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "Curriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CurriculumTopic_curriculum_order_idx" ON "CurriculumTopic"("curriculumId","displayOrder");

CREATE TABLE "TeachingPlan" (
  "id" TEXT NOT NULL,
  "topicId" TEXT NOT NULL,
  "academicSectionId" TEXT NOT NULL,
  "teacherStaffId" TEXT NOT NULL,
  "plannedStartDate" TIMESTAMP(3),
  "plannedEndDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PLANNED',
  "notes" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeachingPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeachingPlan_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CurriculumTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TeachingPlan_topic_section_unique_idx" ON "TeachingPlan"("topicId","academicSectionId");
CREATE INDEX "TeachingPlan_section_status_idx" ON "TeachingPlan"("academicSectionId","status");
CREATE INDEX "TeachingPlan_teacher_status_idx" ON "TeachingPlan"("teacherStaffId","status");
CREATE INDEX "TeachingPlan_dates_idx" ON "TeachingPlan"("plannedStartDate","plannedEndDate");
