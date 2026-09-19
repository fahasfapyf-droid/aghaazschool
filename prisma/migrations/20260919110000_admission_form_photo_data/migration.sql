-- Extend admission applications with the school-form photo and structured form payload.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "photoDataUrl" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "formData" JSONB;
