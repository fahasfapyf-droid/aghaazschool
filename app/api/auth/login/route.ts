import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSessionToken, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const context = requestAuditContext(request);
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) {
      await writeAuditLog({ action: "LOGIN_FAILED", entityType: "User", metadata: { reason: "invalid_credentials" }, context });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await writeAuditLog({ userId: user.id, action: "LOGIN_SUCCESS", entityType: "User", entityId: user.id, context });
    const response = NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    response.cookies.set(SESSION_COOKIE, createSessionToken(user.id, user.role), {
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
