import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const MAX_LOGIN_BODY_BYTES = 8 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_LOGINS_PER_IP = 10;

function tooManyAttemptsResponse() {
  return NextResponse.json(
    { error: "Too many sign-in attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(LOGIN_WINDOW_MS / 1000)) } },
  );
}

export async function POST(request: NextRequest) {
  const context = requestAuditContext(request);
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_LOGIN_BODY_BYTES) return NextResponse.json({ error: "Request is too large." }, { status: 413 });

    const since = new Date(Date.now() - LOGIN_WINDOW_MS);
    if (context.ipAddress) {
      const recentFailures = await prisma.auditLog.count({
        where: { action: "LOGIN_FAILED", ipAddress: context.ipAddress, createdAt: { gte: since } },
      });
      if (recentFailures >= MAX_FAILED_LOGINS_PER_IP) return tooManyAttemptsResponse();
    }

    const body = await request.json();
    const identifier = String(body.identifier ?? body.phone ?? "").trim();
    const phone = identifier.replace(/[\s().-]/g, "");
    const password = String(body.password ?? "");
    if (!identifier || !password) return NextResponse.json({ error: "Username/phone and password are required." }, { status: 400 });
    const isPhone = /^\+?\d{8,15}$/.test(phone);
    const user = isPhone
      ? await prisma.user.findUnique({
          where: { phone },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            passwordHash: true,
            role: true,
            active: true,
            mustChangePassword: true,
          },
        })
      : await prisma.user.findUnique({
          where: { username: identifier.toLowerCase() },
          select: {
            id: true,
            name: true,
            username: true,
            phone: true,
            email: true,
            passwordHash: true,
            role: true,
            active: true,
            mustChangePassword: true,
          },
        });
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      await writeAuditLog({ action: "LOGIN_FAILED", entityType: "User", metadata: { reason: "invalid_credentials" }, context });
      return NextResponse.json({ error: "Invalid phone number or password." }, { status: 401 });
    }

    await writeAuditLog({ userId: user.id, action: "LOGIN_SUCCESS", entityType: "User", entityId: user.id, metadata: { mustChangePassword: user.mustChangePassword }, context });
    const response = NextResponse.json({ user: { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword } });
    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, user.role, user.mustChangePassword), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes("AUTH_SECRET")) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
