ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "fatherName" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "employeeCnic" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "emergencyContact" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "academicQualification" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "professionalQualification" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "trainingCourses" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "employmentStatus" TEXT NOT NULL DEFAULT 'EMPLOYED';

CREATE INDEX IF NOT EXISTS "Staff_employeeCnic_idx" ON "Staff"("employeeCnic");
CREATE INDEX IF NOT EXISTS "Staff_employmentStatus_idx" ON "Staff"("employmentStatus");
