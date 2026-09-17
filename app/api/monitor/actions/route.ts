import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;
const MUTATION_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;

type ActionRow = { id: string; category: string; referenceId: string; title: string; description: string | null; status: string; assignedTo: string | null; dueDate: Date | null; resolution: string | null; createdBy: string | null; createdAt: Date; updatedAt: Date };

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "You do not have permission to access Monitor actions." }, { status: 403 });

  const status = request.nextUrl.searchParams.get("status");
  const params: unknown[] = [];
  let where = "";
  if (status && STATUSES.includes(status as (typeof STATUSES)[number])) {
    params.push(status);
    where = `WHERE "status" = $${params.length}`;
  }
  const rows = await prisma.$queryRawUnsafe<ActionRow[]>(`SELECT * FROM "MonitorAction" ${where} ORDER BY "updatedAt" DESC LIMIT 100`, ...params);
  return NextResponse.json({ actions: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...MUTATION_ROLES])) return NextResponse.json({ error: "You do not have permission to create Monitor actions." }, { status: 403 });
  try {
    const body = await request.json();
    if (!body.category || !body.referenceId || !body.title) return NextResponse.json({ error: "category, referenceId and title are required." }, { status: 400 });
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "MonitorAction" ("id","category","referenceId","title","description","status","assignedTo","dueDate","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,$8,NOW(),NOW())`, id, String(body.category), String(body.referenceId), String(body.title), body.description ? String(body.description) : null, body.assignedTo ? String(body.assignedTo) : null, body.dueDate ? new Date(body.dueDate) : null, user.id);
    await writeAuditLog({ userId: user.id, action: "CREATE_MONITOR_ACTION", entityType: "MonitorAction", entityId: id, metadata: { category: body.category, referenceId: body.referenceId, title: body.title } });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create Monitor action." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...MUTATION_ROLES])) return NextResponse.json({ error: "You do not have permission to update Monitor actions." }, { status: 403 });
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Action id is required." }, { status: 400 });
    const status = String(body.status || "");
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) return NextResponse.json({ error: "Invalid action status." }, { status: 400 });
    const resolution = body.resolution ? String(body.resolution) : null;
    const assignedTo = body.assignedTo ? String(body.assignedTo) : null;
    const dueDate = body.dueDate ? new Date(body.dueDate) : null;
    const result = await prisma.$executeRawUnsafe(`UPDATE "MonitorAction" SET "status"=$1,"resolution"=$2,"assignedTo"=$3,"dueDate"=$4,"updatedAt"=NOW() WHERE "id"=$5`, status, resolution, assignedTo, dueDate, String(body.id));
    if (!result) return NextResponse.json({ error: "Monitor action not found." }, { status: 404 });
    await writeAuditLog({ userId: user.id, action: `MONITOR_ACTION_${status}`, entityType: "MonitorAction", entityId: String(body.id), metadata: { resolution, assignedTo, dueDate } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update Monitor action." }, { status: 500 });
  }
}
