-- Normalize enrollment lifecycle status and prevent future casing drift.
UPDATE "Enrollment"
SET "status" = UPPER(BTRIM("status"));

ALTER TABLE "Enrollment"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "Enrollment"
  ADD CONSTRAINT "Enrollment_status_check"
  CHECK ("status" IN ('ACTIVE','ENROLLED','WITHDRAWN','TRANSFERRED','INACTIVE','GRADUATED'));
