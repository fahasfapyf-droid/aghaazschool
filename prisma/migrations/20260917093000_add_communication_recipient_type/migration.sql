ALTER TABLE "CommunicationDelivery"
  ADD COLUMN "recipientType" TEXT;

CREATE INDEX "CommunicationDelivery_recipientType_ref_channel_idx"
  ON "CommunicationDelivery"("recipientType","recipientRef","channel");

CREATE INDEX "CommunicationDelivery_notice_recipient_channel_idx"
  ON "CommunicationDelivery"("noticeId","recipientRef","channel");
