import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "aghaaz_parent_session";
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body.token || "").trim();
    if (!token || token.length < 32) return NextResponse.json({ error: "A valid parent access token is required." }, { status: 400 });
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; enrollmentId: string; expiresAt: Date }>>(`SELECT "id","enrollmentId","expiresAt" FROM "ParentAccessToken" WHERE "tokenHash"=$1 AND "revokedAt" IS NULL AND "expiresAt">NOW() LIMIT 1`, hashToken(token));
    if (!rows.length) return NextResponse.json({ error: "This parent access link is invalid or expired." }, { status: 401 });
    await prisma.$executeRawUnsafe(`UPDATE "ParentAccessToken" SET "lastUsedAt"=NOW() WHERE "id"=$1`, rows[0].id);
    const jar = await cookies();
    jar.set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: COOKIE_TTL_SECONDS });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to start parent session." }, { status: 500 });
  }
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(COOKIE);
  return NextResponse.json({ ok: true });
}
