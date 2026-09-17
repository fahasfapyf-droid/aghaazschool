import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;
const MUTATION_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;
const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;

type ActionRow = { id: string; category: string; referenceId: string; title: string; description: string | null; status: string; assignedTo: string | null; dueDate: Date | null; resolution: string | null; createdBy: string | null; createdAt: Date; updatedAt: Date };

function parseDueDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Invalid due date.");
  return date;
}

async function authorized(request: NextRequest, action: string) {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, action === "read" ? [...ROLES] : [...MUTATION_ROLES])) {
    return { error: NextResponse.json({ error: `You do not have permission to ${action} Monitor actions.` }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await authorized(request, "access");
  if (auth.error) return auth.error;

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
  const auth = await authorized(request, "create");
  if (auth.error) return auth.error;
  const user = auth.user;

  try {
    const body = await request.json();
    const category = String(body.category || "").trim();
    const referenceId = String(body.referenceId || "").trim();
    const title = String(body.title || "").trim();
    if (!category || !referenceId || !title) return NextResponse.json({ error: "category, referenceId and title are required." }, { status: 400 });
    if (title.length > 200 || category.length > 80 || referenceId.length > 160) return NextResponse.json({ error: "Action fields exceed the allowed length." }, { status: 400 });

    const dueDate = parseDueDate(body.dueDate);
    const assignedTo = body.assignedTo ? String(body.assignedTo).trim() : null;
    if (assignedTo) {
      const staff = await prisma.staff.findUnique({ where: { id: assignedTo }, select: { id: true, active: true } });
      if (!staff || !staff.active) return NextResponse.json({ error: "Assigned staff member is not active." }, { status: 400 });
    }

    const existing = await prisma.$queryRawUnsafe<ActionRow[]>(`SELECT * FROM "MonitorAction" WHERE "category"=$1 AND "referenceId"=$2 AND "status" IN ('OPEN','IN_PROGRESS') ORDER BY "updatedAt" DESC LIMIT 1`, category, referenceId);
    if (existing[0]) return NextResponse.json({ id: existing[0].id, existing: true, action: existing[0] }, { status: 200 });

    const id = randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "MonitorAction" ("id","category","referenceId","title","description","status","assignedTo","dueDate","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,'OPEN',$6,$7,$8,NOW(),NOW())`, id, category, referenceId, title, body.description ? String(body.description).trim().slice(0, 2000) : null, assignedTo, dueDate, user.id);
    await writeAuditLog({ userId: user.id, action: "CREATE_MONITOR_ACTION", entityType: "MonitorAction", entityId: id, metadata: { category, referenceId, title, assignedTo, dueDate } });
    return NextResponse.json({ id, existing: false }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create Monitor action." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorized(request, "update");
  if (auth.error) return auth.error;
  const user = auth.user;

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Action id is required." }, { status: 400 });
    const status = String(body.status || "").trim();
    if (!STATUSES.includes(status as (typeof STATUSES)[number])) return NextResponse.json({ error: "Invalid action status." }, { status: 400 });

    const current = await prisma.$queryRawUnsafe<ActionRow[]>(`SELECT * FROM "MonitorAction" WHERE "id"=$1 LIMIT 1`, id);
    if (!current[0]) return NextResponse.json({ error: "Monitor action not found." }, { status: 404 });

    const assignedTo = body.assignedTo === undefined ? current[0].assignedTo : (body.assignedTo ? String(body.assignedTo).trim() : null);
    if (assignedTo) {
      const staff = await prisma.staff.findUnique({ where: { id: assignedTo }, select: { id: true, active: true } });
      if (!staff || !staff.active) return NextResponse.json({ error: "Assigned staff member is not active." }, { status: 400 });
    }
    const dueDate = body.dueDate === undefined ? current[0].dueDate : parseDueDate(body.dueDate);
    const resolution = body.resolution === undefined ? current[0].resolution : (body.resolution ? String(body.resolution).trim().slice(0, 2000) : null);
    if ((status === "RESOLVED" || status === "DISMISSED") && !resolution) return NextResponse.json({ error: "Add a resolution or dismissal note before closing the action." }, { status: 400 });

    await prisma.$executeRawUnsafe(`UPDATE "MonitorAction" SET "status"=$1,"resolution"=$2,"assignedTo"=$3,"dueDate"=$4,"updatedAt"=NOW() WHERE "id"=$5`, status, resolution, assignedTo, dueDate, id);
    await writeAuditLog({ userId: user.id, action: `MONITOR_ACTION_${status}`, entityType: "MonitorAction", entityId: id, metadata: { resolution, assignedTo, dueDate } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Monitor action." }, { status: 400 });
  }
}
