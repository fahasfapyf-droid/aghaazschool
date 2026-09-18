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

async function staffForUser(userId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; employeeNumber: string; name: string; staffType: string }>>(
    `SELECT "id","employeeNumber","name","staffType" FROM "Staff" WHERE "userId"=$1 LIMIT 1`, userId,
  );
  return rows[0] ?? null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestAuditContext(request);
  try {
    const actor = await authorize();
    const { id } = await params;
    const body = await request.json();
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const data: { name?: string; phone?: string; email?: string | null; role?: UserRole; active?: boolean; passwordHash?: string } = {};
    if (body.phone !== undefined) {
      const phone = String(body.phone).trim().replace(/[\s().-]/g, "");
      if (!/^\+?\d{8,15}$/.test(phone)) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
      const existingPhone = await prisma.user.findFirst({ where: { phone, NOT: { id } }, select: { id: true } });
      if (existingPhone) return NextResponse.json({ error: "That phone number already belongs to another user." }, { status: 409 });
      data.phone = phone;
    }
    if (body.email !== undefined) {
      const emailValue = String(body.email ?? "").trim().toLowerCase();
      if (emailValue && !/^\S+@\S+\.\S+$/.test(emailValue)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      if (emailValue) {
        const existingEmail = await prisma.user.findFirst({ where: { email: emailValue, NOT: { id } }, select: { id: true } });
        if (existingEmail) return NextResponse.json({ error: "That email address already belongs to another user." }, { status: 409 });
      }
      data.email = emailValue || null;
    }
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

    const hasStaffChange = Object.prototype.hasOwnProperty.call(body, "staffId");
    const staffId = body.staffId === null || body.staffId === "" ? null : body.staffId === undefined ? undefined : String(body.staffId);
    if (!Object.keys(data).length && !hasStaffChange) return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
    if (staffId !== undefined) {
      if (staffId) {
        const staff = await prisma.$queryRawUnsafe<Array<{ id: string; userId: string | null }>>(`SELECT "id","userId" FROM "Staff" WHERE "id"=$1 LIMIT 1`, staffId);
        if (!staff.length) return NextResponse.json({ error: "Staff record not found." }, { status: 404 });
        if (staff[0].userId && staff[0].userId !== id) return NextResponse.json({ error: "That staff record is already linked to another user account." }, { status: 409 });
      }
    }

    const user = await prisma.$transaction(async tx => {
      const updated = Object.keys(data).length ? await tx.user.update({ where: { id }, data, select: { id: true, name: true, phone: true, email: true, role: true, active: true, updatedAt: true } }) : await tx.user.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, email: true, role: true, active: true, updatedAt: true } });
      if (staffId !== undefined) {
        await tx.$executeRawUnsafe(`UPDATE "Staff" SET "userId"=NULL,"updatedAt"=NOW() WHERE "userId"=$1`, id);
        if (staffId) await tx.$executeRawUnsafe(`UPDATE "Staff" SET "userId"=$1,"updatedAt"=NOW() WHERE "id"=$2`, id, staffId);
      }
      return updated;
    });

    await writeAuditLog({ userId: actor.id, action: "USER_UPDATED", entityType: "User", entityId: user.id, metadata: { changedFields: [...Object.keys(data), ...(hasStaffChange ? ["staffId"] : [])], role: user.role, active: user.active, staffId: staffId === undefined ? "unchanged" : staffId }, context });
    return NextResponse.json({ user: { ...user, linkedStaff: await staffForUser(user.id) } });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "Administrator access required." : "Authentication required." }, { status });
  }
}
