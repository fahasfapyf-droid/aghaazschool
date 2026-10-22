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

For production, use the versioned migration workflow. For a fresh database, or an existing database that already has its migration history aligned:

```bash
npm run db:deploy
npm run build
npm start
```

If an existing production database was originally created with `prisma db push`, follow [`docs/production-migration.md`](docs/production-migration.md) before the first `migrate deploy`.

Do not use `prisma db push` against the production database. All future production schema changes must be committed as versioned migrations under `prisma/migrations/`.

## Database regression checks

To provision the first permanent administrator, set `ADMIN_PASSWORD` securely in the process environment and run `npm run db:seed-admin` against the intended database. `ADMIN_USERNAME` defaults to `admin` and `ADMIN_NAME` to `School Administrator`; `ADMIN_PHONE` and `ADMIN_EMAIL` are optional. The command never prints the password, never overwrites an existing account, and safely supports repeated runs with the same credentials. Do not commit passwords or place them in shell command history.

Run `npm run test:browser` with a running local PostgreSQL server and `DATABASE_URL` set. It creates, migrates and removes its own isolated database, provisions a test administrator and drives admissions, enrollment, attendance, fee collection, three-term exams and official report-card release in Chromium. Stop any existing Next.js development server first because both use `.next`. Install the test browser with `npx playwright install chromium`, or point `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to a compatible installed Chromium executable. `npm run test:communication-providers` validates email/SMS webhook payloads, HMAC signatures and failures against a local mock without contacting real recipients.

Use a disposable PostgreSQL database with all migrations applied. `npm run test:student-registry-db` checks enrollment identity, GR number allocation and custom-field persistence.

With the application running against that same database, run `npm run test:calendar-summaries-db`. Set `TEST_BASE_URL` if it uses a URL other than `http://127.0.0.1:3000`. This checks dashboard and daily-brief preview events, including dates, publication status, seven-day bounds, ordering and result limits. It creates temporary administrator/event fixtures and removes them afterward; it does not deliver notifications. Both database checks run in CI.

## Vercel deployment

This project is deployed from the `main` branch through its connected Vercel project. Production schema changes must use the versioned Prisma migration workflow documented in [`docs/production-migration.md`](docs/production-migration.md).
