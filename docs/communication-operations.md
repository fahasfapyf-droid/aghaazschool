# Communication operations

Aghaaz queues recipient-level communication deliveries and processes them asynchronously.

## Required production secrets

- `CRON_SECRET` — protects the scheduled delivery worker.
- `COMMUNICATION_WEBHOOK_SECRET` — signs outbound email/SMS provider requests with `x-aghaaz-signature` (HMAC-SHA256).
- `COMMUNICATION_EMAIL_WEBHOOK_URL` — optional email provider endpoint.
- `COMMUNICATION_SMS_WEBHOOK_URL` — optional SMS provider endpoint.

The application does not store provider API keys in the database.

## Delivery worker

Vercel Cron invokes `/api/communication/process` every five minutes. The worker processes at most 100 queued deliveries per invocation, uses PostgreSQL row locking to avoid duplicate workers, retries transient provider failures, and stops after three attempts.

The worker can also be invoked by an authenticated administrator through the application route.

## Provider contract

The outbound provider receives JSON containing `channel`, `destination`, `recipientName`, `subject`, `body`, `noticeId`, and `deliveryId`. A successful provider may return `{ "messageId": "..." }`.

Providers should verify `x-aghaaz-signature` using the shared `COMMUNICATION_WEBHOOK_SECRET` before accepting a request.

## Event notifications

Attendance marked `ABSENT` automatically queues a parent notification. The event source is recorded using `eventKey` and `sourceRef`, so repeated writes for the same absence do not create duplicate event notifications.

Queued does not mean sent or delivered. Email/SMS require a configured provider; in-app delivery uses Aghaaz's internal channel.
