CREATE TABLE "Staff" (
  "id" TEXT NOT NULL,
  "employeeNumber" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "staffType" TEXT NOT NULL,
  "designation" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "gender" "Gender",
  "dateOfBirth" TIMESTAMP(3),
  "joiningDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subject" TEXT,
  "qualifications" TEXT,
  "assignedClasses" TEXT,
  "salary" DECIMAL(12,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Staff_employeeNumber_key" ON "Staff"("employeeNumber");
CREATE INDEX "Staff_staffType_active_idx" ON "Staff"("staffType", "active");
CREATE INDEX "Staff_name_idx" ON "Staff"("name");

ALTER TABLE "PayrollRecord" ADD COLUMN "staffId" TEXT;
CREATE INDEX "PayrollRecord_staffId_payrollMonth_idx" ON "PayrollRecord"("staffId", "payrollMonth");
ALTER TABLE "PayrollRecord" ADD CONSTRAINT "PayrollRecord_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
