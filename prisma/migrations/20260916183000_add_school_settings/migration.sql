CREATE TABLE "SchoolSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SchoolSetting_key_key" ON "SchoolSetting"("key");
CREATE INDEX "SchoolSetting_updatedAt_idx" ON "SchoolSetting"("updatedAt");