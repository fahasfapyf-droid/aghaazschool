ALTER TABLE "CommunicationDelivery"
  ADD COLUMN "eventKey" TEXT,
  ADD COLUMN "sourceRef" TEXT;

CREATE INDEX "CommunicationDelivery_eventKey_sourceRef_idx"
  ON "CommunicationDelivery"("eventKey","sourceRef");

CREATE INDEX "CommunicationDelivery_sourceRef_idx"
  ON "CommunicationDelivery"("sourceRef");
