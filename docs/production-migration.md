# Production Prisma migration bootstrap

Aghaaz now has a versioned baseline migration followed by the report-card release migrations.

Migration order:

1. `20260915000000_init`
2. `20260915190000_add_report_card_release`
3. `20260915220000_add_report_card_release_foreign_keys`

## Fresh production database

For a new PostgreSQL database, run:

```bash
npm ci
npm run db:generate
npm run db:deploy
npm run build
npm start
```

`prisma migrate deploy` applies the complete schema baseline and then the later migrations.

## Existing production database created with `prisma db push`

Do **not** run the baseline SQL against an existing database. The baseline represents the schema that already exists there; it must first be recorded as applied.

1. Back up the database.
2. Confirm that the existing schema matches `prisma/schema.prisma` for the pre-release models.
3. Mark the baseline migration as applied:

```bash
npx prisma migrate resolve --applied 20260915000000_init
```

4. Apply the remaining versioned migrations:

```bash
npm run db:deploy
```

5. Validate the application build:

```bash
npm run build
npm start
```

If the existing database already contains the `ReportCardRelease` table from the earlier release migrations, its migration records should also already exist in `_prisma_migrations`. Do not manually recreate or drop that table.

## Rules

- Production schema changes must be represented by a committed Prisma migration.
- Do not use `prisma db push` for production changes.
- Take a database backup before resolving a baseline or deploying a new migration.
- If Prisma reports drift, stop and reconcile the schema rather than forcing the migration.
