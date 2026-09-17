ALTER TABLE "CommunicationDelivery"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "providerName" TEXT;

CREATE INDEX "CommunicationDelivery_nextAttempt_status_idx"
  ON "CommunicationDelivery"("nextAttemptAt","status");

CREATE INDEX "CommunicationDelivery_providerMessageId_idx"
  ON "CommunicationDelivery"("providerMessageId");
