CREATE TABLE "StaffAttendance" (
  "id" TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "status" TEXT NOT NULL,
  "checkIn" TIMESTAMP(3),
  "checkOut" TIMESTAMP(3),
  "remarks" TEXT,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StaffAttendance_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StaffAttendance_status_check" CHECK ("status" IN ('PRESENT','ABSENT','LATE','HALF_DAY','EXCUSED'))
);
CREATE UNIQUE INDEX "StaffAttendance_staffId_date_key" ON "StaffAttendance"("staffId","date");
CREATE INDEX "StaffAttendance_date_status_idx" ON "StaffAttendance"("date","status");
CREATE INDEX "StaffAttendance_staffId_date_idx" ON "StaffAttendance"("staffId","date");
