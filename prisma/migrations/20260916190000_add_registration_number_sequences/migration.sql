-- Make registration and admission numbers database-backed so concurrent registrations cannot reuse count-based numbers.
CREATE SEQUENCE IF NOT EXISTS "application_number_seq";
CREATE SEQUENCE IF NOT EXISTS "admission_number_seq";

SELECT setval(
  '"application_number_seq"',
  GREATEST(
    COALESCE((SELECT MAX((substring("applicationNumber" from '[0-9]+$'))::bigint) FROM "Application" WHERE "applicationNumber" ~ '[0-9]+$'), 0) + 1,
    1
  ),
  false
);

SELECT setval(
  '"admission_number_seq"',
  GREATEST(
    COALESCE((SELECT MAX((substring("admissionNumber" from '[0-9]+$'))::bigint) FROM "Enrollment" WHERE "admissionNumber" ~ '[0-9]+$'), 0) + 1,
    1
  ),
  false
);
