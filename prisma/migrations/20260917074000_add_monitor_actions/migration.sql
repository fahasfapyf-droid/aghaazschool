CREATE TABLE "MonitorAction" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "assignedTo" TEXT,
  "dueDate" TIMESTAMP(3),
  "resolution" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonitorAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MonitorAction_status_dueDate_idx" ON "MonitorAction"("status", "dueDate");
CREATE INDEX "MonitorAction_category_referenceId_idx" ON "MonitorAction"("category", "referenceId");
CREATE INDEX "MonitorAction_assignedTo_status_idx" ON "MonitorAction"("assignedTo", "status");
CREATE INDEX "MonitorAction_createdAt_idx" ON "MonitorAction"("createdAt");
