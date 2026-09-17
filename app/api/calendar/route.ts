import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

type EventRow = { id: string; title: string; description: string | null; eventType: string; audience: string; startDate: Date; endDate: Date; allDay: boolean; location: string | null; status: string; createdAt: Date };
const MANAGE_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;
const VIEW_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"] as const;
const eventSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  eventType: z.enum(["GENERAL", "HOLIDAY", "EXAM", "PARENT_MEETING", "STAFF_MEETING", "DEADLINE", "ACTIVITY", "OTHER"]),
  audience: z.enum(["ALL", "STAFF", "TEACHERS", "PARENTS", "STUDENTS"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  allDay: z.boolean().default(false),
  location: z.string().trim().max(200).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).default("PUBLISHED"),
});

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !roleAllowed(user.role, [...VIEW_ROLES])) return NextResponse.json({ error: "You do not have permission to view the school calendar." }, { status: user ? 403 : 401 });
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const fromDate = from ? new Date(from) : new Date();
  const toDate = to ? new Date(to) : new Date(fromDate.getTime() + 90 * 86400000);
  const rows = await prisma.$queryRawUnsafe<EventRow[]>(`
    SELECT "id","title","description","eventType","audience","startDate","endDate","allDay","location","status","createdAt"
    FROM "SchoolEvent"
    WHERE "startDate" < $2 AND "endDate" >= $1
      AND ("status"='PUBLISHED' OR $3 = true)
    ORDER BY "startDate" ASC, "title" ASC
    LIMIT 500
  `, fromDate, toDate, user.role === "SUPER_ADMIN" || user.role === "ADMIN");
  return NextResponse.json({ events: rows });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...MANAGE_ROLES])) return NextResponse.json({ error: "Only administrators can manage calendar events." }, { status: 403 });
  try {
    const input = eventSchema.parse(await request.json());
    const start = new Date(input.startDate); const end = new Date(input.endDate);
    if (end < start) return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "SchoolEvent" ("id","title","description","eventType","audience","startDate","endDate","allDay","location","status","createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, id, input.title, input.description || null, input.eventType, input.audience, start, end, input.allDay, input.location || null, input.status, user.id);
    await prisma.auditLog.create({ data: { userId: user.id, action: "SCHOOL_EVENT_CREATED", entityType: "SchoolEvent", entityId: id, metadata: { title: input.title, eventType: input.eventType, audience: input.audience, startDate: start.toISOString(), endDate: end.toISOString(), status: input.status } } });
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid calendar event.", details: error.flatten() }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "Unable to create calendar event." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...MANAGE_ROLES])) return NextResponse.json({ error: "Only administrators can manage calendar events." }, { status: 403 });
  try {
    const body = await request.json(); const id = z.string().min(1).parse(body.id); const input = eventSchema.parse(body);
    const start = new Date(input.startDate); const end = new Date(input.endDate);
    if (end < start) return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
    const result = await prisma.$executeRawUnsafe(`UPDATE "SchoolEvent" SET "title"=$1,"description"=$2,"eventType"=$3,"audience"=$4,"startDate"=$5,"endDate"=$6,"allDay"=$7,"location"=$8,"status"=$9,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$10`, input.title, input.description || null, input.eventType, input.audience, start, end, input.allDay, input.location || null, input.status, id);
    if (!result) return NextResponse.json({ error: "Calendar event not found." }, { status: 404 });
    await prisma.auditLog.create({ data: { userId: user.id, action: "SCHOOL_EVENT_UPDATED", entityType: "SchoolEvent", entityId: id, metadata: { title: input.title, eventType: input.eventType, audience: input.audience, status: input.status } } });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid calendar event.", details: error.flatten() }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "Unable to update calendar event." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...MANAGE_ROLES])) return NextResponse.json({ error: "Only administrators can manage calendar events." }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Event id is required." }, { status: 400 });
  const result = await prisma.$executeRawUnsafe(`DELETE FROM "SchoolEvent" WHERE "id"=$1`, id);
  if (!result) return NextResponse.json({ error: "Calendar event not found." }, { status: 404 });
  await prisma.auditLog.create({ data: { userId: user.id, action: "SCHOOL_EVENT_DELETED", entityType: "SchoolEvent", entityId: id, metadata: {} } });
  return NextResponse.json({ ok: true });
}
