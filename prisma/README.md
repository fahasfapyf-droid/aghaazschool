# Prisma deployment

The repository currently keeps the Prisma schema as the source of truth and does not include a generated migration history.

## Local development

1. Set `DATABASE_URL` to a PostgreSQL database.
2. Run `npx prisma generate`.
3. Create the first migration from the current schema with `npx prisma migrate dev --name initial_school_management`.
4. Commit the generated `prisma/migrations/` directory.

## Production

Run `npx prisma generate` during the build and `npx prisma migrate deploy` during deployment. Do not use `prisma db push` as the production migration mechanism.

## Authentication

Set `AUTH_SECRET` to a random value of at least 32 characters. Create the first `User` record through your controlled database provisioning process with a password hash in the format `scrypt$<salt>$<derived-key>`. The application rejects sessions when `AUTH_SECRET` is missing or too short.

The login route is `/login`. User roles are `SUPER_ADMIN`, `ADMIN`, `TEACHER`, `ACCOUNTANT`, and `RECEPTIONIST`.
