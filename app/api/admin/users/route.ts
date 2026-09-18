import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPasswordHash, requireUser } from "@/lib/auth";
import { writeAuditLog, requestAuditContext } from "@/lib/audit";
import { Prisma, UserRole } from "@prisma/client";

const ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN"];

async function authorize() {
  const user = await requireUser();
  if (!ADMIN_ROLES.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

async function linkedStaff(userIds: string[]) {
  if (!userIds.length) return new Map<string, { id: string; employeeNumber: string; name: string; staffType: string }>();
  const rows = await prisma.$queryRawUnsafe<Array<{ userId: string; id: string; employeeNumber: string; name: string; staffType: string }>>(
    `SELECT "userId","id","employeeNumber","name","staffType" FROM "Staff" WHERE "userId" = ANY($1::text[])`, userIds,
  );
  return new Map(rows.map(row => [row.userId, row]));
}

export async function GET() {
  try {
    await authorize();
    const users = await prisma.user.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, phone: true, email: true, role: true, active: true, createdAt: true, updatedAt: true },
    });
    const staff = await linkedStaff(users.map(user => user.id));
    return NextResponse.json({ users: users.map(user => ({ ...user, linkedStaff: staff.get(user.id) ?? null })) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A user with one of the supplied unique identifiers already exists." }, { status: 409 });
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
    const phone = String(body.phone ?? "").trim().replace(/[\s().-]/g, "");
    const emailValue = String(body.email ?? "").trim().toLowerCase();
    const email = emailValue || null;
    const password = String(body.password ?? "");
    const role = String(body.role ?? "RECEPTIONIST") as UserRole;
    const staffId = body.staffId === undefined || body.staffId === null || body.staffId === "" ? null : String(body.staffId);
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Name must be 2–100 characters." }, { status: 400 });
    if (!/^\+?\d{8,15}$/.test(phone)) return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    if (!Object.values(UserRole).includes(role)) return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    if (actor.role !== "SUPER_ADMIN" && role === "SUPER_ADMIN") return NextResponse.json({ error: "Only a Super Admin can create another Super Admin." }, { status: 403 });
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) return NextResponse.json({ error: "A user with this phone number already exists." }, { status: 409 });
    if (email) {
      const existingEmail = await prisma.user.findUnique({ where: { email } });
      if (existingEmail) return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    if (staffId) {
      const staff = await prisma.$queryRawUnsafe<Array<{ id: string; userId: string | null }>>(`SELECT "id","userId" FROM "Staff" WHERE "id"=$1 LIMIT 1`, staffId);
      if (!staff.length) return NextResponse.json({ error: "Staff record not found." }, { status: 404 });
      if (staff[0].userId) return NextResponse.json({ error: "That staff record is already linked to a user account." }, { status: 409 });
    }
    const user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({ data: { name, phone, email, role, passwordHash: createPasswordHash(password), mustChangePassword: true }, select: { id: true, name: true, phone: true, email: true, role: true, active: true, updatedAt: true } });
      if (staffId) await tx.$executeRawUnsafe(`UPDATE "Staff" SET "userId"=$1,"updatedAt"=NOW() WHERE "id"=$2`, created.id, staffId);
      return created;
    });
    await writeAuditLog({ userId: actor.id, action: "USER_CREATED", entityType: "User", entityId: user.id, metadata: { role: user.role, staffId }, context });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "Administrator access required." : "Authentication required." }, { status });
  }
}
