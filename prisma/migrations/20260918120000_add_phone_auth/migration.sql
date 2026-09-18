-- Staff accounts authenticate with a unique phone number.
-- Email remains optional for contact/notifications and is no longer the login identifier.

ALTER TABLE "User"
  ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "User"
  ADD COLUMN "phone" TEXT;

CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
