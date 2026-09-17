CREATE TABLE "SchoolEvent" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "eventType" TEXT NOT NULL DEFAULT 'GENERAL',
  "audience" TEXT NOT NULL DEFAULT 'ALL',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "location" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SchoolEvent_date_idx" ON "SchoolEvent"("startDate", "endDate", "status");
CREATE INDEX "SchoolEvent_audience_idx" ON "SchoolEvent"("audience", "startDate");
CREATE INDEX "SchoolEvent_type_idx" ON "SchoolEvent"("eventType", "startDate");
