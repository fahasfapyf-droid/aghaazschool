CREATE TABLE "ParentLeaveRequest" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentLeaveRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParentLeaveRequest_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ParentLeaveRequest_enrollmentId_status_idx" ON "ParentLeaveRequest"("enrollmentId", "status");
CREATE INDEX "ParentLeaveRequest_status_startDate_idx" ON "ParentLeaveRequest"("status", "startDate");
CREATE INDEX "ParentLeaveRequest_createdAt_idx" ON "ParentLeaveRequest"("createdAt");
