import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync("lib/communication/providers.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sendDelivery, DeliveryProviderError } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const names = ["COMMUNICATION_EMAIL_WEBHOOK_URL", "COMMUNICATION_SMS_WEBHOOK_URL", "COMMUNICATION_WEBHOOK_SECRET"];
const original = names.map(name => process.env[name]);
const secret = randomBytes(32).toString("hex");
const received = [];
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();
  received.push({ payload: JSON.parse(body), signature: request.headers["x-aghaaz-signature"], expectedSignature: createHmac("sha256", secret).update(body).digest("hex") });
  response.writeHead(request.url === "/failure" ? 503 : 200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ messageId: "local-provider-test" }));
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}`;

try {
  process.env.COMMUNICATION_WEBHOOK_SECRET = secret;
  process.env.COMMUNICATION_EMAIL_WEBHOOK_URL = url;
  process.env.COMMUNICATION_SMS_WEBHOOK_URL = url;
  for (const channel of ["EMAIL", "SMS"]) {
    const payload = { channel, destination: channel === "EMAIL" ? "test@example.invalid" : "00000000000", recipientName: "Synthetic local recipient", subject: "Provider contract test", body: "This request only reaches a local mock server.", noticeId: "local-notice", deliveryId: "local-delivery" };
    const result = await sendDelivery(payload);
    assert.equal(result.providerMessageId, "local-provider-test");
    assert.equal(result.providerName, `${channel}_WEBHOOK`);
    const request = received.at(-1);
    assert.deepEqual(request.payload, payload);
    assert.equal(request.signature, request.expectedSignature);
  }
  process.env.COMMUNICATION_EMAIL_WEBHOOK_URL = `${url}/failure`;
  const payload = { channel: "EMAIL", destination: "test@example.invalid", recipientName: null, subject: null, body: "Local failure check", noticeId: "local-notice", deliveryId: "local-delivery" };
  await assert.rejects(sendDelivery(payload), error => error instanceof DeliveryProviderError && error.message.includes("503"));
  delete process.env.COMMUNICATION_EMAIL_WEBHOOK_URL;
  await assert.rejects(sendDelivery(payload), /EMAIL provider is not configured/);
  process.env.COMMUNICATION_EMAIL_WEBHOOK_URL = url;
  delete process.env.COMMUNICATION_WEBHOOK_SECRET;
  await assert.rejects(sendDelivery(payload), /webhook secret is not configured/);
  const internal = await sendDelivery({ ...payload, channel: "IN_APP" });
  assert.equal(internal.providerName, "INTERNAL_IN_APP");
  console.log("Communication provider tests passed: email/SMS payloads, HMAC signatures, provider failures, missing settings and internal delivery. No external messages were sent.");
} finally {
  names.forEach((name, index) => { if (original[index] === undefined) delete process.env[name]; else process.env[name] = original[index]; });
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
