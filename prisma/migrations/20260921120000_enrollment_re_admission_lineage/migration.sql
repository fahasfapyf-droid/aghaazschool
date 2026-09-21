-- Preserve enrollment history while allowing a terminal enrollment to be re-admitted as a new enrollment with a new GR number.
ALTER TABLE "Enrollment" ADD COLUMN IF NOT EXISTS "reAdmissionOfId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Enrollment_reAdmissionOfId_fkey'
  ) THEN
    ALTER TABLE "Enrollment"
      ADD CONSTRAINT "Enrollment_reAdmissionOfId_fkey"
      FOREIGN KEY ("reAdmissionOfId")
      REFERENCES "Enrollment"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Enrollment_reAdmissionOfId_idx"
  ON "Enrollment"("reAdmissionOfId");
