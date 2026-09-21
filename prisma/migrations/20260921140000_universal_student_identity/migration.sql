-- Universalize student identity across academic enrollments.
-- GR remains an enrollment/session identifier; the stable StudentIdentity links
-- the same person across historical enrollments and re-admissions.

CREATE TABLE IF NOT EXISTS "StudentIdentity" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentIdentity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Enrollment"
  ADD COLUMN IF NOT EXISTS "studentIdentityId" TEXT;

INSERT INTO "StudentIdentity" ("id","createdAt","updatedAt")
SELECT 'SI-' || md5(e."id"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Enrollment" e
WHERE NOT EXISTS (
  SELECT 1 FROM "StudentIdentity" si WHERE si."id" = 'SI-' || md5(e."id")
);

UPDATE "Enrollment" e
SET "studentIdentityId" = 'SI-' || md5(e."id")
WHERE e."studentIdentityId" IS NULL;

UPDATE "Enrollment" child
SET "studentIdentityId" = parent."studentIdentityId"
FROM "Enrollment" parent
WHERE child."reAdmissionOfId" = parent."id"
  AND parent."studentIdentityId" IS NOT NULL;

DELETE FROM "StudentIdentity" si
WHERE NOT EXISTS (
  SELECT 1 FROM "Enrollment" e WHERE e."studentIdentityId" = si."id"
);

ALTER TABLE "Enrollment"
  ALTER COLUMN "studentIdentityId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Enrollment_studentIdentityId_fkey'
  ) THEN
    ALTER TABLE "Enrollment"
      ADD CONSTRAINT "Enrollment_studentIdentityId_fkey"
      FOREIGN KEY ("studentIdentityId")
      REFERENCES "StudentIdentity"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "StudentIdentity_createdAt_idx"
  ON "StudentIdentity"("createdAt");

CREATE INDEX IF NOT EXISTS "Enrollment_studentIdentityId_idx"
  ON "Enrollment"("studentIdentityId");

ALTER TABLE "StudentRegistry"
  DROP CONSTRAINT IF EXISTS "StudentRegistry_grNumber_key";

CREATE INDEX IF NOT EXISTS "StudentRegistry_grNumber_idx"
  ON "StudentRegistry"("grNumber");
