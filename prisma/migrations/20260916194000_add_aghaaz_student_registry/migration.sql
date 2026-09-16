CREATE TABLE "StudentRegistryConfig" (
  "id" TEXT PRIMARY KEY,
  "prefix" TEXT NOT NULL DEFAULT 'GR-',
  "nextNumber" INTEGER NOT NULL DEFAULT 1,
  "padding" INTEGER NOT NULL DEFAULT 5,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "StudentRegistry" (
  "id" TEXT PRIMARY KEY,
  "enrollmentId" TEXT NOT NULL UNIQUE,
  "grNumber" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentRegistry_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StudentCustomFieldDefinition" (
  "id" TEXT PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "section" TEXT NOT NULL DEFAULT 'Additional Information',
  "type" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "showInRegistration" BOOLEAN NOT NULL DEFAULT true,
  "showOnProfile" BOOLEAN NOT NULL DEFAULT true,
  "showInReports" BOOLEAN NOT NULL DEFAULT false,
  "visibilityRoles" JSONB NOT NULL DEFAULT '[]',
  "options" JSONB,
  "condition" JSONB,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "StudentCustomFieldValue" (
  "id" TEXT PRIMARY KEY,
  "studentRegistryId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "value" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentCustomFieldValue_studentRegistryId_fkey" FOREIGN KEY ("studentRegistryId") REFERENCES "StudentRegistry"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentCustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "StudentCustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudentCustomFieldValue_unique" UNIQUE ("studentRegistryId", "fieldId")
);

CREATE INDEX "StudentRegistry_grNumber_idx" ON "StudentRegistry"("grNumber");
CREATE INDEX "StudentCustomFieldDefinition_active_order_idx" ON "StudentCustomFieldDefinition"("active", "displayOrder");
CREATE INDEX "StudentCustomFieldValue_field_value_idx" ON "StudentCustomFieldValue"("fieldId", "value");

INSERT INTO "StudentRegistryConfig" ("id", "prefix", "nextNumber", "padding") VALUES ('default', 'GR-', 1, 5) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "StudentCustomFieldDefinition" ("id", "key", "label", "section", "type", "required", "showInRegistration", "showOnProfile", "showInReports", "visibilityRoles", "options", "condition", "displayOrder") VALUES
('field_bform', 'birth_certificate_number', 'B-Form / Birth Certificate Number', 'Student Information', 'text', false, true, true, true, '["SUPER_ADMIN","ADMIN","RECEPTIONIST"]', NULL, NULL, 10),
('field_father_job', 'father_occupation', 'Father''s Occupation', 'Family Information', 'text', false, true, true, true, '["SUPER_ADMIN","ADMIN","RECEPTIONIST"]', NULL, NULL, 20),
('field_scholarship', 'scholarship', 'Scholarship / Fee Support', 'Financial / Support', 'boolean', false, true, true, true, '["SUPER_ADMIN","ADMIN"]', NULL, NULL, 30),
('field_scholarship_reason', 'scholarship_reason', 'Scholarship Reason', 'Financial / Support', 'long_text', false, true, true, true, '["SUPER_ADMIN","ADMIN"]', NULL, '{"field":"scholarship","equals":true}', 40),
('field_transport', 'transport_required', 'Transport Required', 'Additional Information', 'boolean', false, true, true, false, '["SUPER_ADMIN","ADMIN","RECEPTIONIST"]', NULL, NULL, 50),
('field_pickup', 'pickup_point', 'Pickup Point / Route', 'Additional Information', 'text', false, true, true, false, '["SUPER_ADMIN","ADMIN","RECEPTIONIST"]', NULL, '{"field":"transport_required","equals":true}', 60)
ON CONFLICT ("key") DO NOTHING;
