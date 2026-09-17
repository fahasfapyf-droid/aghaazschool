CREATE TABLE "CommunicationPreference" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunicationPreference_eventKey_key" UNIQUE ("eventKey")
);
CREATE INDEX "CommunicationPreference_active_idx" ON "CommunicationPreference"("active");

INSERT INTO "CommunicationPreference" ("id","eventKey","label","description") VALUES
  ('comm-pref-attendance-absent','ATTENDANCE_ABSENT','Attendance absence','Notify a parent when an absence is recorded.'),
  ('comm-pref-fee-overdue','FEE_OVERDUE','Overdue fee','Notify a parent when a fee invoice becomes overdue.'),
  ('comm-pref-homework-due-soon','HOMEWORK_DUE_SOON','Homework due soon','Notify a parent about homework due within the next 24 hours.'),
  ('comm-pref-homework-overdue','HOMEWORK_OVERDUE','Overdue homework','Notify a parent when homework remains unsubmitted after its due date.'),
  ('comm-pref-result-recorded','RESULT_RECORDED','Published result','Notify a parent when a published examination result is recorded.'),
  ('comm-pref-admission-approved','ADMISSION_APPROVED','Admission approved','Notify an applicant guardian when an admission is approved.'),
  ('comm-pref-admission-rejected','ADMISSION_REJECTED','Admission rejected','Notify an applicant guardian when an admission is rejected.'),
  ('comm-pref-admission-waitlisted','ADMISSION_WAITLISTED','Admission waitlisted','Notify an applicant guardian when an admission is waitlisted.'),
  ('comm-pref-admission-enrolled','ADMISSION_ENROLLED','Admission enrolled','Notify an applicant guardian when an admission is enrolled.');
