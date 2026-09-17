import { NextRequest, NextResponse } from "next/server";
import { createPasswordHash, getCurrentUser, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const MAX_BODY_BYTES = 8 * 1024;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Request is too large." }, { status: 413 });

  try {
    const body = await request.json();
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (!currentPassword || !newPassword) return NextResponse.json({ error: "Current and new passwords are required." }, { status: 400 });
    if (newPassword.length < 10 || newPassword.length > 128) return NextResponse.json({ error: "New password must be between 10 and 128 characters." }, { status: 400 });
    if (currentPassword === newPassword) return NextResponse.json({ error: "New password must be different from the current password." }, { status: 400 });

    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!account || !verifyPassword(currentPassword, account.passwordHash)) {
      await writeAuditLog({ userId: user.id, action: "PASSWORD_CHANGE_FAILED", entityType: "User", entityId: user.id, metadata: { reason: "invalid_current_password" }, context: requestAuditContext(request) });
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: createPasswordHash(newPassword) } });
    await writeAuditLog({ userId: user.id, action: "PASSWORD_CHANGED", entityType: "User", entityId: user.id, context: requestAuditContext(request) });
    const response = NextResponse.json({ ok: true, message: "Password changed. Please sign in again." });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to change password." }, { status: 500 });
  }
}
