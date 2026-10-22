# Development validation and external setup

The local cloud environment uses Node 22, locked npm dependencies and PostgreSQL 16 with all 42 versioned migrations applied.

## Verified locally

- Frozen `npm ci`, Prisma schema validation/client generation and repeated migration deployment.
- Type checking, production build and ESLint with `--max-warnings 0`.
- All 17 package test scripts. The browser script runs two Chromium tests, including a complete admission → enrollment → attendance → invoice/payment → three-term examinations → official report-card release workflow and cron authentication.
- Calendar summaries use the migrated date columns and preserve their existing response fields.
- Student-selection screens use enrollment IDs and the directory's student names consistently.
- Publication and dashboard counts recognize canonical ACTIVE/ENROLLED records. Examination readiness follows current academic placement.
- Bulk entry refuses changes to released report cards; the browser test verifies no result is written.
- Administrator provisioning is repeatable and never overwrites another user's credentials. Tests provision administrators only in a temporary database; no permanent account was created without a supplied password.
- Email/SMS payloads, HMAC signatures, missing settings and provider failures are checked against a local mock. No external messages were sent.
- The scheduled communication worker accepts cron-authenticated GET and rejects an administrator session without the cron token.

The CI workflow includes the database checks, mock-provider checks and Chromium tests. Local execution of the production server/calendar CI step passed; a GitHub Actions run has not been verified because repository push access is blocked.

## Required external configuration

1. Give the connected GitHub account write access to the repository, or connect an account that has it. The environment can read the repository, but a push was rejected for `mkashifqazi-source`.
2. Supply `ADMIN_PASSWORD` securely and run `npm run db:seed-admin` against the intended database. The default username is `admin`; optional administrator fields are documented in the main README. No password belongs in Git, chat or command history.
3. Supply the live production URL and authorized deployment access before checking production runtime, database migration status or scheduled-job configuration. `PRODUCTION_DATABASE_URL` and `VERCEL_TOKEN` requirements are recorded in the cloud settings draft; secret values were not supplied.
4. Configure the real `COMMUNICATION_EMAIL_WEBHOOK_URL`, `COMMUNICATION_SMS_WEBHOOK_URL`, shared `COMMUNICATION_WEBHOOK_SECRET` and `CRON_SECRET` in the deployment environment. Verify the provider contract and scheduling plan before enabling recurring delivery. The checked-in Vercel cron schedules the daily brief; the communication worker still needs a scheduler configured for the chosen hosting plan.

The cloud draft also requests network access to `api.github.com` and `api.vercel.com` for deployment and repository inspection. Saving a draft does not activate credentials, network changes or production deployment.
