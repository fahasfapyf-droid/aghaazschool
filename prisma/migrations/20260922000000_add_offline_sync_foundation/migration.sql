-- Durable offline synchronization primitives.
CREATE TABLE "SyncDevice" (
  "id" TEXT NOT NULL,
  "deviceKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "userId" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastPullAt" TIMESTAMP(3),
  "lastPushAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SyncDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncOperation" (
  "id" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "clientCreatedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "errorCode" TEXT,
  "errorMessage" TEXT,
  CONSTRAINT "SyncOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncCursor" (
  "id" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "lastReceivedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SyncCursor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SyncDevice_deviceKey_key" ON "SyncDevice"("deviceKey");
CREATE UNIQUE INDEX "SyncOperation_operationKey_key" ON "SyncOperation"("operationKey");
CREATE UNIQUE INDEX "SyncCursor_deviceId_key" ON "SyncCursor"("deviceId");
CREATE INDEX "SyncDevice_userId_idx" ON "SyncDevice"("userId");
CREATE INDEX "SyncOperation_deviceId_status_idx" ON "SyncOperation"("deviceId","status");
CREATE INDEX "SyncOperation_entityType_entityId_idx" ON "SyncOperation"("entityType","entityId");
CREATE INDEX "SyncOperation_receivedAt_idx" ON "SyncOperation"("receivedAt");

ALTER TABLE "SyncOperation"
  ADD CONSTRAINT "SyncOperation_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyncCursor"
  ADD CONSTRAINT "SyncCursor_deviceId_fkey"
  FOREIGN KEY ("deviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
