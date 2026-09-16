import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const adminRoles = ["SUPER_ADMIN", "ADMIN"] as const;
const schema = z.object({
  active: z.boolean().optional(),
  designation: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  subject: z.string().trim().max(120).optional(),
  qualifications: z.string().trim().max(500).optional(),
  assignedClasses: z.string().trim().max(500).optional(),
  salary: z.coerce.number().nonnegative().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, [...adminRoles])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update", details: parsed.error.flatten() }, { status: 400 });
  try {
    const row = await prisma.staff.update({ where: { id }, data: parsed.data });
    await writeAuditLog({ userId: user.id, action: "STAFF_UPDATED", entityType: "Staff", entityId: row.id, metadata: parsed.data, context: requestAuditContext(request) });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Staff record not found." }, { status: 404 });
  }
}