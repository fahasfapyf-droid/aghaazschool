-- Require administrator-provisioned accounts to change their temporary password on first sign-in.
ALTER TABLE "User"
  ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
