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

export async function GET() {
  try {
    await authorize();
    const users = await prisma.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ users });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "Administrator access required." : "Authentication required." }, { status });
  }
}

export async function POST(request: NextRequest) {
  const context = requestAuditContext(request);
  try {
    const actor = await authorize();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const role = String(body.role ?? "RECEPTIONIST") as UserRole;
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Name must be 2–100 characters." }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    if (!Object.values(UserRole).includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    if (actor.role !== "SUPER_ADMIN" && role === "SUPER_ADMIN") return NextResponse.json({ error: "Only a Super Admin can create another Super Admin." }, { status: 403 });
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    const user = await prisma.user.create({ data: { name, email, role, passwordHash: createPasswordHash(password) }, select: { id: true, name: true, email: true, role: true, active: true } });
    await writeAuditLog({ userId: actor.id, action: "USER_CREATED", entityType: "User", entityId: user.id, metadata: { role: user.role }, context });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "Administrator access required." : "Authentication required." }, { status });
  }
}
