-- Add school-issued Family Portal credentials and student links.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FAMILY';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "username" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");

CREATE TABLE IF NOT EXISTS "FamilyAccount" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FamilyAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FamilyAccount_userId_key" UNIQUE ("userId"),
  CONSTRAINT "FamilyAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "FamilyAccountStudent" (
  "familyAccountId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FamilyAccountStudent_pkey" PRIMARY KEY ("familyAccountId","enrollmentId"),
  CONSTRAINT "FamilyAccountStudent_familyAccountId_fkey" FOREIGN KEY ("familyAccountId") REFERENCES "FamilyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FamilyAccountStudent_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "FamilyAccountStudent_enrollmentId_idx" ON "FamilyAccountStudent"("enrollmentId");
