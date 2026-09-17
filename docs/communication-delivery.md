# Communication delivery

Aghaaz uses a recipient-level delivery queue. Queueing a published notice resolves the selected audience into recipients and creates one delivery record per recipient and channel.

## Processing

`POST /api/communication/process` processes up to 100 queued deliveries per request. It uses PostgreSQL row locking so concurrent workers do not claim the same delivery. Failed deliveries retry with backoff and stop after three attempts. Stale `SENDING` rows older than 15 minutes are returned to the queue when they have attempts remaining.

## Providers

- `IN_APP`: internal provider; delivery is recorded without an external service.
- `EMAIL`: HTTP webhook configured with `COMMUNICATION_EMAIL_WEBHOOK_URL`.
- `SMS`: HTTP webhook configured with `COMMUNICATION_SMS_WEBHOOK_URL`.

Webhook providers receive JSON containing `channel`, `destination`, `recipientName`, `subject`, `body`, `noticeId`, and `deliveryId`. A successful response may include `{ "messageId": "..." }`; that value is stored as `providerMessageId`.

Providers that support asynchronous delivery can call `POST /api/communication/webhook` with `Authorization: Bearer $COMMUNICATION_WEBHOOK_SECRET` and JSON such as `{ "providerMessageId": "...", "status": "DELIVERED" }` or `{ "providerMessageId": "...", "status": "FAILED", "error": "..." }`.

If an email/SMS provider is not configured, processing records a provider-configuration failure and retries rather than claiming that the message was sent.

## Production worker

Run the process endpoint from a trusted authenticated worker/service on a short recurring schedule. The endpoint is intentionally bounded to prevent a single request from attempting an unbounded recipient set.
