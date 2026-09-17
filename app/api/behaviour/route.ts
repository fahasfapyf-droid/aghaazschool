import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { queueParentNotification } from "@/lib/communication/events";

const ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER", "RECEPTIONIST"] as const;
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;
const createSchema = z.object({
  enrollmentId: z.string().min(1),
  occurredAt: z.string().datetime().optional(),
  category: z.string().trim().min(1).max(80),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  actionTaken: z.string().trim().max(2000).optional(),
  followUpDue: z.string().datetime().optional(),
  followUpNote: z.string().trim().max(1000).optional(),
});
const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"]).optional(),
  followUpDue: z.string().datetime().nullable().optional(),
  followUpNote: z.string().trim().max(1000).nullable().optional(),
  resolutionNote: z.string().trim().max(2000).nullable().optional(),
});

type BehaviourRow = {
  id: string; enrollmentId: string; studentName: string; grNumber: string | null;
  occurredAt: string; category: string; severity: string; title: string;
  description: string | null; actionTaken: string | null; followUpDue: string | null;
  followUpNote: string | null; status: string; parentNotified: boolean;
  createdBy: string | null; resolvedAt: string | null; resolvedBy: string | null; resolutionNote: string | null;
};

async function getRows(enrollmentId?: string) {
  return prisma.$queryRawUnsafe<BehaviourRow[]>(`
    SELECT b."id", b."enrollmentId", a."studentName", sr."grNumber", b."occurredAt", b."category", b."severity", b."title",
      b."description", b."actionTaken", b."followUpDue", b."followUpNote", b."status", b."parentNotified", b."createdBy", b."resolvedAt", b."resolvedBy", b."resolutionNote"
    FROM "StudentBehaviourRecord" b
    JOIN "Enrollment" e ON e."id"=b."enrollmentId"
    JOIN "Application" a ON a."id"=e."applicationId"
    LEFT JOIN "StudentRegistry" sr ON sr."enrollmentId"=e."id"
    ${enrollmentId ? `WHERE b."enrollmentId"=$1` : ""}
    ORDER BY b."occurredAt" DESC
    LIMIT 300
  `, ...(enrollmentId ? [enrollmentId] : []));
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const enrollmentId = request.nextUrl.searchParams.get("enrollmentId") || undefined;
    return NextResponse.json({ records: await getRows(enrollmentId) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load behaviour records." }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...WRITE_ROLES])) return NextResponse.json({ error: "You do not have permission to record behaviour." }, { status: 403 });
  try {
    const input = createSchema.parse(await request.json());
    const enrollment = await prisma.enrollment.findUnique({ where: { id: input.enrollmentId }, include: { application: true } });
    if (!enrollment) return NextResponse.json({ error: "Student enrollment not found." }, { status: 404 });
    if (!enrollment.application.guardianName?.trim()) return NextResponse.json({ error: "Student guardian information is incomplete." }, { status: 400 });
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`
      INSERT INTO "StudentBehaviourRecord" ("id","enrollmentId","occurredAt","category","severity","title","description","actionTaken","followUpDue","followUpNote","status","createdBy","createdAt","updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'OPEN',$11,NOW(),NOW())
    `, id, input.enrollmentId, input.occurredAt ? new Date(input.occurredAt) : new Date(), input.category, input.severity, input.title,
      input.description || null, input.actionTaken || null, input.followUpDue ? new Date(input.followUpDue) : null, input.followUpNote || null, user.id);

    const notification = await queueParentNotification({
      eventKey: "BEHAVIOR_INCIDENT",
      sourceRef: id,
      enrollmentId: input.enrollmentId,
      title: `Student wellbeing follow-up: ${input.title}`,
      message: `${enrollment.application.studentName}: a ${input.severity.toLowerCase()}-severity ${input.category.toLowerCase()} record has been logged. Please contact the school if follow-up is required.`,
      createdBy: user.id,
    });
    if (notification.created) await prisma.$executeRawUnsafe(`UPDATE "StudentBehaviourRecord" SET "parentNotified"=true,"updatedAt"=NOW() WHERE "id"=$1`, id);

    await prisma.auditLog.create({ data: { userId: user.id, action: "BEHAVIOUR_RECORDED", entityType: "StudentBehaviourRecord", entityId: id, metadata: { enrollmentId: input.enrollmentId, category: input.category, severity: input.severity, parentNotificationQueued: notification.created } } });
    return NextResponse.json({ ok: true, id, parentNotification: notification.created });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid behaviour record.", details: error.flatten() }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Unable to record behaviour." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...WRITE_ROLES])) return NextResponse.json({ error: "You do not have permission to update behaviour." }, { status: 403 });
  try {
    const input = updateSchema.parse(await request.json());
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "StudentBehaviourRecord" WHERE "id"=$1 LIMIT 1`, input.id);
    if (!rows.length) return NextResponse.json({ error: "Behaviour record not found." }, { status: 404 });
    const status = input.status ?? undefined;
    const resolved = status === "RESOLVED";
    await prisma.$executeRawUnsafe(`
      UPDATE "StudentBehaviourRecord"
      SET "status"=COALESCE($1,"status"), "followUpDue"=COALESCE($2,"followUpDue"), "followUpNote"=COALESCE($3,"followUpNote"),
          "resolutionNote"=COALESCE($4,"resolutionNote"), "resolvedAt"=CASE WHEN $5 THEN NOW() ELSE "resolvedAt" END,
          "resolvedBy"=CASE WHEN $5 THEN $6 ELSE "resolvedBy" END, "updatedAt"=NOW()
      WHERE "id"=$7
    `, status ?? null, input.followUpDue === undefined ? null : input.followUpDue ? new Date(input.followUpDue) : null,
      input.followUpNote === undefined ? null : input.followUpNote, input.resolutionNote === undefined ? null : input.resolutionNote,
      resolved, resolved ? user.id : null, input.id);
    await prisma.auditLog.create({ data: { userId: user.id, action: `BEHAVIOUR_${status || "UPDATED"}`, entityType: "StudentBehaviourRecord", entityId: input.id, metadata: { status: status || null } } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid behaviour update.", details: error.flatten() }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Unable to update behaviour." }, { status: 400 });
  }
}
