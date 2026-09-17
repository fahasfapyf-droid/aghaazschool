-- Reconcile legacy enrollments with the academic structure without changing
-- permanent GR/admission numbers or enrollment IDs.
-- Matching is intentionally conservative:
--   1. session comes from the enrollment's Application.sessionId
--   2. grade matches the stored className or application desiredClass by name/code
--   3. section matches the stored section within that grade
-- Rows that cannot be matched uniquely are left untouched for manual review.

UPDATE "Enrollment" e
SET "academicSessionId" = a."sessionId"
FROM "Application" a
WHERE e."applicationId" = a."id"
  AND e."academicSessionId" IS NULL;

UPDATE "Enrollment" e
SET "academicGradeId" = (
  SELECT g."id"
  FROM "AcademicGrade" g
  WHERE g."sessionId" = a."sessionId"
    AND (
      lower(trim(g."name")) = lower(trim(e."className"))
      OR lower(trim(g."code")) = lower(trim(e."className"))
      OR lower(trim(g."name")) = lower(trim(a."desiredClass"))
      OR lower(trim(g."code")) = lower(trim(a."desiredClass"))
    )
  LIMIT 1
)
FROM "Application" a
WHERE e."applicationId" = a."id"
  AND e."academicGradeId" IS NULL
  AND (
    SELECT count(*)
    FROM "AcademicGrade" g
    WHERE g."sessionId" = a."sessionId"
      AND (
        lower(trim(g."name")) = lower(trim(e."className"))
        OR lower(trim(g."code")) = lower(trim(e."className"))
        OR lower(trim(g."name")) = lower(trim(a."desiredClass"))
        OR lower(trim(g."code")) = lower(trim(a."desiredClass"))
      )
  ) = 1;

UPDATE "Enrollment" e
SET "academicSectionId" = s."id"
FROM "AcademicSection" s
WHERE e."academicGradeId" = s."gradeId"
  AND e."academicSectionId" IS NULL
  AND e."section" IS NOT NULL
  AND lower(trim(s."name")) = lower(trim(e."section"));

-- Record the reconciled placement as an auditable baseline. Only enrollments
-- with a resolved academic placement are seeded into lifecycle history.
INSERT INTO "EnrollmentHistory" (
  "id",
  "enrollmentId",
  "action",
  "academicSessionId",
  "academicSessionName",
  "academicGradeId",
  "academicGradeName",
  "academicSectionId",
  "academicSectionName",
  "className",
  "section",
  "status",
  "effectiveAt",
  "note",
  "createdBy",
  "createdAt"
)
SELECT
  'backfill-' || e."id",
  e."id",
  'BACKFILL',
  e."academicSessionId",
  s."name",
  e."academicGradeId",
  g."name",
  e."academicSectionId",
  sec."name",
  e."className",
  e."section",
  e."status",
  e."enrolledAt",
  'Initial academic placement reconciled from legacy enrollment data.',
  NULL,
  CURRENT_TIMESTAMP
FROM "Enrollment" e
LEFT JOIN "AcademicSession" s ON s."id" = e."academicSessionId"
LEFT JOIN "AcademicGrade" g ON g."id" = e."academicGradeId"
LEFT JOIN "AcademicSection" sec ON sec."id" = e."academicSectionId"
WHERE e."academicSessionId" IS NOT NULL
  AND e."academicGradeId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "EnrollmentHistory" h
    WHERE h."enrollmentId" = e."id"
      AND h."action" = 'BACKFILL'
  );
