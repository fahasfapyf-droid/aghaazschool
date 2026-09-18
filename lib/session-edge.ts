import type { UserRole } from "@prisma/client";

export const SESSION_COOKIE = "aghaaz_session";

type SessionPayload = { userId: string; role: UserRole; mustChangePassword: boolean; iat: number; exp: number };

function decodeBase64url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(normalized);
}

async function hmac(value: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return { key };
}

export async function verifySessionTokenEdge(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const imported = await hmac(encoded);
    if (!imported) return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      imported.key,
      Uint8Array.from(decodeBase64url(signature), c => c.charCodeAt(0)),
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(decodeBase64url(encoded)) as SessionPayload;
    if (!payload.userId || !payload.role || !Number.isSafeInteger(payload.iat) || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
