# Aghaaz School Management System

Aghaaz is a school management platform built with Next.js, TypeScript, Prisma and PostgreSQL.

## Current modules

- **Dashboard** — school overview and quick access
- **Admissions** — application pipeline, applicant details, document tracking, assessments, decisions, payments and enrollment
- **Students** — enrolled-student directory with search and class filtering

## Admission lifecycle

Enquiry → Application → Document Verification → Assessment → Decision → Payment → Enrollment

## Admission workflow

From an application detail page, administrators can:

- change the application status
- add document references
- schedule a test or interview
- record admission payments and receipts
- record an approval, rejection or waitlist decision
- enroll the applicant and assign class/section

## Local development

1. Install dependencies with `npm install`.
2. Set `DATABASE_URL` for PostgreSQL.
3. Apply the current Prisma schema with `npx prisma db push` during development.
4. Start the app with `npm run dev`.

The production deployment should use a versioned Prisma migration workflow rather than `db push`.
