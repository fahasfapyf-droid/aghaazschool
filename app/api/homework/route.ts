import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import type { UserRole } from "@prisma/client";

const HOMEWORK_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "TEACHER"];

async function authorized() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, HOMEWORK_ROLES)) return { response: NextResponse.json({ error: "You do not have permission to manage homework." }, { status: 403 }) };
  return { user };
}

const homeworkSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(1).max(5000),
  className: z.string().trim().min(1).max(80),
  section: z.string().trim().max(20).optional().nullable(),
  subject: z.string().trim().min(1).max(100),
  teacher: z.string().trim().min(1).max(100),
  assignedDate: z.coerce.date().optional(),
  dueDate: z.coerce.date(),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]).optional(),
});

export async function GET(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  try {
    const params = new URL(request.url).searchParams;
    const className = params.get("class")?.trim();
    const status = params.get("status")?.trim();
    const items = await prisma.homework.findMany({ where: { ...(className ? { className: { equals: className, mode: "insensitive" } } : {}), ...(status ? { status: status as never } : {}) }, include: { _count: { select: { submissions: true } } }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] });
    return NextResponse.json(items);
  } catch { return NextResponse.json({ error: "Unable to load homework." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  const context = requestAuditContext(request);
  try {
    const body = homeworkSchema.parse(await request.json());
    const assignedDate = body.assignedDate ?? new Date();
    if (body.dueDate < assignedDate) return NextResponse.json({ error: "Due date cannot be before assigned date." }, { status: 400 });
    const item = await prisma.homework.create({ data: { ...body, assignedDate } });
    await writeAuditLog({ userId: auth.user.id, action: "HOMEWORK_CREATED", entityType: "Homework", entityId: item.id, metadata: { className: item.className, section: item.section, subject: item.subject, status: item.status }, context });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid homework details.", details: error.flatten() }, { status: 400 });
    return NextResponse.json({ error: "Unable to create homework." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  const context = requestAuditContext(request);
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Homework id is required." }, { status: 400 });
    const body = homeworkSchema.partial().parse(await request.json());
    const existing = await prisma.homework.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Homework not found." }, { status: 404 });
    const assignedDate = body.assignedDate ?? existing.assignedDate;
    const dueDate = body.dueDate ?? existing.dueDate;
    if (dueDate < assignedDate) return NextResponse.json({ error: "Due date cannot be before assigned date." }, { status: 400 });
    const item = await prisma.homework.update({ where: { id }, data: body });
    await writeAuditLog({ userId: auth.user.id, action: "HOMEWORK_UPDATED", entityType: "Homework", entityId: item.id, metadata: { changedFields: Object.keys(body) }, context });
    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid homework details." }, { status: 400 });
    return NextResponse.json({ error: "Unable to update homework." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  const context = requestAuditContext(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Homework id is required." }, { status: 400 });
  try {
    const existing = await prisma.homework.findUnique({ where: { id }, include: { _count: { select: { submissions: true } } } });
    if (!existing) return NextResponse.json({ error: "Homework not found." }, { status: 404 });
    if (existing._count.submissions > 0) return NextResponse.json({ error: "Homework with submissions cannot be deleted. Close it instead." }, { status: 409 });
    await prisma.homework.delete({ where: { id } });
    await writeAuditLog({ userId: auth.user.id, action: "HOMEWORK_DELETED", entityType: "Homework", entityId: id, metadata: { className: existing.className, section: existing.section, subject: existing.subject }, context });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Unable to delete homework." }, { status: 500 }); }
}
