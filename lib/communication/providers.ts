import { createHmac } from "node:crypto";

export type DeliveryChannel = "IN_APP" | "EMAIL" | "SMS";

export type ProviderPayload = {
  channel: DeliveryChannel;
  destination: string | null;
  recipientName: string | null;
  subject: string | null;
  body: string;
  noticeId: string;
  deliveryId: string;
};

export type ProviderResult = {
  providerName: string;
  providerMessageId?: string | null;
};

export class DeliveryProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryProviderError";
  }
}

async function webhookProvider(url: string, payload: ProviderPayload, providerName: string): Promise<ProviderResult> {
  const body = JSON.stringify(payload);
  const secret = process.env.COMMUNICATION_WEBHOOK_SECRET;
  const signature = secret ? createHmac("sha256", secret).update(body).digest("hex") : null;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "x-aghaaz-signature": signature } : {}),
    },
    body,
    cache: "no-store",
  });
  if (!response.ok) throw new DeliveryProviderError(`${providerName} provider returned HTTP ${response.status}.`);
  let result: { messageId?: unknown } = {};
  try {
    result = (await response.json()) as { messageId?: unknown };
  } catch {
    // A successful provider may return an empty body; the delivery is still sent.
  }
  return {
    providerName,
    providerMessageId: typeof result.messageId === "string" ? result.messageId : null,
  };
}

export async function sendDelivery(payload: ProviderPayload): Promise<ProviderResult> {
  if (payload.channel === "IN_APP") {
    return { providerName: "INTERNAL_IN_APP", providerMessageId: payload.deliveryId };
  }

  const url = payload.channel === "EMAIL"
    ? process.env.COMMUNICATION_EMAIL_WEBHOOK_URL
    : process.env.COMMUNICATION_SMS_WEBHOOK_URL;

  if (!url) {
    throw new DeliveryProviderError(`${payload.channel} provider is not configured.`);
  }

  if (!process.env.COMMUNICATION_WEBHOOK_SECRET) {
    throw new DeliveryProviderError("Communication webhook secret is not configured.");
  }

  return webhookProvider(url, payload, payload.channel === "EMAIL" ? "EMAIL_WEBHOOK" : "SMS_WEBHOOK");
}
