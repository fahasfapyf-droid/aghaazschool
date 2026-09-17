# Production Prisma migration bootstrap

Aghaaz uses versioned Prisma migrations for every production schema change. Never use `prisma db push` against production.

## Current migration order

The repository currently applies migrations in timestamp order, including:

1. `20260915000000_init`
2. `20260915190000_add_report_card_release`
3. `20260915220000_add_report_card_release_foreign_keys`
4. `20260916123000_add_audit_login_rate_limit_index`
5. `20260916170000_add_finance_transactions`
6. `20260916181000_add_staff`
7. `20260916190000_add_registration_number_sequences`
8. `20260916194000_add_aghaaz_student_registry`
9. `20260916210000_add_school_setting`
10. `20260917050000_add_academic_structure`
11. `20260917062000_add_enrollment_lifecycle`
12. `20260917070000_add_enrollment_session_fk`
13. `20260917072000_backfill_enrollment_academic_placement`

`prisma migrate deploy` determines the exact applied set from the database migration table; do not manually execute individual migration SQL files in normal operation.

## Fresh production database

For a new PostgreSQL database:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run build
npm start
```

`npm ci` uses the committed `package-lock.json` so production installs are deterministic and match CI.

## Existing production database created with `prisma db push`

Do **not** run the baseline SQL against an existing database. The baseline represents the schema that already exists there; it must first be recorded as applied.

1. Take a database backup.
2. Confirm that the existing schema matches the pre-migration Aghaaz schema.
3. Mark the baseline migration as applied:

```bash
npx prisma migrate resolve --applied 20260915000000_init
```

4. Apply all subsequent versioned migrations:

```bash
npm run db:deploy
```

5. Validate the application build:

```bash
npm run build
npm start
```

If the database already contains later migration changes from an earlier deployment, verify `_prisma_migrations` before resolving anything. Do not manually recreate or drop existing tables to make Prisma accept a migration.

## Guarded GitHub production migration

The repository also contains `.github/workflows/production-migrate.yml` for a controlled migration from GitHub Actions.

Before using it, create the repository secret:

`PRODUCTION_DATABASE_URL`

Then open **Actions → Production Database Migration → Run workflow** and type exactly:

`MIGRATE`

The workflow runs `prisma validate`, `prisma generate`, and `prisma migrate deploy`. It does not build or start the application, so application deployment remains a separate step.

## Rules

- Production schema changes must be represented by a committed Prisma migration.
- Do not use `prisma db push` for production changes.
- Back up production before the first migration bootstrap and before material schema changes.
- Treat a migration failure as a deployment blocker.
- If Prisma reports drift, stop and reconcile the schema rather than forcing the migration.
- Never put the production database URL directly in source control, workflow YAML, or documentation.
