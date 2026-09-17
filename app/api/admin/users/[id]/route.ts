import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPasswordHash, requireUser } from "@/lib/auth";
import { writeAuditLog, requestAuditContext } from "@/lib/audit";
import { UserRole } from "@prisma/client";

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];

async function authorize() {
  const user = await requireUser();
  if (!ADMIN_ROLES.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestAuditContext(request);
  try {
    const actor = await authorize();
    const { id } = await params;
    const body = await request.json();
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const data: { name?: string; role?: UserRole; active?: boolean; passwordHash?: string } = {};
    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Name must be 2–100 characters." }, { status: 400 });
      data.name = name;
    }
    if (body.role !== undefined) {
      const role = String(body.role) as UserRole;
      if (!Object.values(UserRole).includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
      if (actor.role !== "SUPER_ADMIN" && role === "SUPER_ADMIN") return NextResponse.json({ error: "Only a Super Admin can assign Super Admin." }, { status: 403 });
      if (target.id === actor.id && role !== actor.role) return NextResponse.json({ error: "You cannot change your own role." }, { status: 400 });
      if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
        const count = await prisma.user.count({ where: { role: "SUPER_ADMIN", active: true } });
        if (count <= 1) return NextResponse.json({ error: "The last active Super Admin cannot be removed or demoted." }, { status: 409 });
      }
      data.role = role;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") return NextResponse.json({ error: "Active must be a boolean." }, { status: 400 });
      const active = body.active;
      if (target.id === actor.id && !active) return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
      if (!active && target.role === "SUPER_ADMIN") {
        const count = await prisma.user.count({ where: { role: "SUPER_ADMIN", active: true } });
        if (count <= 1) return NextResponse.json({ error: "The last active Super Admin cannot be deactivated." }, { status: 409 });
      }
      data.active = active;
    }
    if (body.password !== undefined) {
      const password = String(body.password);
      if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
      data.passwordHash = createPasswordHash(password);
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: "No changes supplied." }, { status: 400 });

    const user = await prisma.user.update({ where: { id }, data, select: { id: true, name: true, email: true, role: true, active: true, updatedAt: true } });
    await writeAuditLog({ userId: actor.id, action: "USER_UPDATED", entityType: "User", entityId: user.id, metadata: { changedFields: Object.keys(data), role: user.role, active: user.active }, context });
    return NextResponse.json({ user });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "Administrator access required." : "Authentication required." }, { status });
  }
}
