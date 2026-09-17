CREATE TABLE "CommunicationTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'IN_APP',
  "audience" TEXT NOT NULL DEFAULT 'ALL',
  "subject" TEXT,
  "body" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunicationTemplate_active_channel_idx" ON "CommunicationTemplate"("active","channel");
CREATE INDEX "CommunicationTemplate_audience_idx" ON "CommunicationTemplate"("audience");

CREATE TABLE "CommunicationDelivery" (
  "id" TEXT NOT NULL,
  "noticeId" TEXT,
  "channel" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "recipientRef" TEXT,
  "recipientName" TEXT,
  "destination" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "providerMessageId" TEXT,
  "error" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunicationDelivery_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "CommunicationNotice"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "CommunicationDelivery_noticeId_idx" ON "CommunicationDelivery"("noticeId");
CREATE INDEX "CommunicationDelivery_status_queuedAt_idx" ON "CommunicationDelivery"("status","queuedAt");
CREATE INDEX "CommunicationDelivery_channel_createdAt_idx" ON "CommunicationDelivery"("channel","createdAt");
CREATE INDEX "CommunicationDelivery_audience_createdAt_idx" ON "CommunicationDelivery"("audience","createdAt");
