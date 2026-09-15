# Aghaaz School Management System

Aghaaz is a school management platform built with Next.js, TypeScript, Prisma and PostgreSQL.

## Current modules

- **Dashboard** — school overview and quick access
- **Admissions** — application pipeline, applicant details, document tracking, assessments, decisions, payments and enrollment
- **Students** — enrolled-student directory with search and class filtering
- **Attendance** — daily attendance registers and student attendance history
- **Fees** — invoices, payments and fee status tracking
- **Examinations** — exam papers, result entry, publication readiness and controlled publishing
- **Results** — individual and class/bulk result entry with configured assessment components
- **Report Cards** — three-term report cards, annual completion checks, grading, ranking and printable official records
- **Official Report Card Release** — administrator-controlled immutable report-card snapshots with SHA-256 integrity hashes
- **Administration** — staff accounts, RBAC and audit activity

## Academic result controls

The result workflow is intentionally staged:

`Result Entry → Examination Validation → Examination Publication → Report Card Completion → Official Release → Immutable Snapshot`

Once an official report card has been released for a student/session:

- the stored report-card snapshot becomes the authoritative record
- result changes for that student are blocked
- published examinations cannot be reopened
- report-card configuration changes are blocked for the academic session
- the original snapshot hash and releasing administrator remain auditable

Only **SUPER_ADMIN** and **ADMIN** can release an official report card.

## Admission lifecycle

Enquiry → Application → Document Verification → Assessment → Decision → Payment → Enrollment

## Local development

1. Install dependencies with `npm install`.
2. Set `DATABASE_URL` for PostgreSQL.
3. Generate the Prisma client with `npm run db:generate`.
4. Apply the schema/migrations appropriate to the environment.
5. Start the app with `npm run dev`.

For production, use the versioned migration workflow:

```bash
npm run db:deploy
npm run build
npm start
```

Do not use `prisma db push` against the production database. The official report-card release table is created by the versioned migrations under `prisma/migrations/`.
