ALTER TABLE "CommunicationDelivery"
  ADD COLUMN "readAt" TIMESTAMP(3);

CREATE TABLE "ParentAccessToken" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentAccessToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ParentAccessToken_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ParentAccessToken_tokenHash_key" ON "ParentAccessToken"("tokenHash");
CREATE INDEX "ParentAccessToken_enrollmentId_expiresAt_idx" ON "ParentAccessToken"("enrollmentId", "expiresAt");
CREATE INDEX "ParentAccessToken_expiresAt_revokedAt_idx" ON "ParentAccessToken"("expiresAt", "revokedAt");
CREATE INDEX "CommunicationDelivery_recipientType_recipientRef_readAt_idx" ON "CommunicationDelivery"("recipientType", "recipientRef", "readAt");
