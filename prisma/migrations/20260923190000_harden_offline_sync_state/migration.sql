-- Harden offline synchronization state and entity idempotency.
ALTER TABLE "AdmissionEnquiry"
  ADD COLUMN "syncOperationKey" TEXT;

ALTER TABLE "Application"
  ADD COLUMN "syncOperationKey" TEXT;

ALTER TABLE "SyncOperation"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AdmissionEnquiry_syncOperationKey_key"
  ON "AdmissionEnquiry"("syncOperationKey");

CREATE UNIQUE INDEX "Application_syncOperationKey_key"
  ON "Application"("syncOperationKey");

ALTER TABLE "SyncOperation"
  ADD CONSTRAINT "SyncOperation_status_check"
  CHECK ("status" IN ('PENDING', 'APPLIED', 'FAILED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'));
