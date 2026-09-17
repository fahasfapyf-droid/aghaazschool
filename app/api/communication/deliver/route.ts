import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

const ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const CHANNELS = ["IN_APP", "EMAIL", "SMS"] as const;
const AUDIENCES = ["ALL", "STUDENTS", "PARENTS", "STAFF", "TEACHERS"] as const;
const MAX_RECIPIENTS = 5000;

type RecipientType = "STUDENT" | "PARENT" | "STAFF";
type Recipient = { recipientType: RecipientType; recipientRef: string; recipientName: string; email: string | null; phone: string | null };

type DeliveryChannel = (typeof CHANNELS)[number];

async function resolveRecipients(audience: string): Promise<Recipient[]> {
  const recipients: Recipient[] = [];
  if (audience === "ALL" || audience === "STUDENTS") {
    const students = await prisma.$queryRawUnsafe<Recipient[]>(`SELECT e."id" AS "recipientRef", a."studentName" AS "recipientName", a."guardianEmail" AS "email", a."guardianPhone" AS "phone" FROM "Enrollment" e JOIN "Application" a ON a."id"=e."applicationId" WHERE lower(e."status") IN ('active','enrolled') ORDER BY a."studentName" ASC LIMIT $1`, MAX_RECIPIENTS);
    recipients.push(...students.map(r => ({ ...r, recipientType: "STUDENT" as const })));
  }
  if (audience === "ALL" || audience === "PARENTS") {
    const parents = await prisma.$queryRawUnsafe<Recipient[]>(`SELECT a."id" AS "recipientRef", a."guardianName" AS "recipientName", a."guardianEmail" AS "email", a."guardianPhone" AS "phone" FROM "Application" a JOIN "Enrollment" e ON e."applicationId"=a."id" WHERE lower(e."status") IN ('active','enrolled') AND NULLIF(TRIM(a."guardianName"), '') IS NOT NULL ORDER BY a."guardianName" ASC LIMIT $1`, MAX_RECIPIENTS);
    recipients.push(...parents.map(r => ({ ...r, recipientType: "PARENT" as const })));
  }
  if (audience === "ALL" || audience === "STAFF" || audience === "TEACHERS") {
    const staff = await prisma.$queryRawUnsafe<Recipient[]>(`SELECT s."id" AS "recipientRef", s."name" AS "recipientName", s."email" AS "email", s."phone" AS "phone" FROM "Staff" s WHERE s."active"=true AND ($1='STAFF' OR lower(s."staffType")='teacher') ORDER BY s."name" ASC LIMIT $2`, audience, MAX_RECIPIENTS);
    recipients.push(...staff.map(r => ({ ...r, recipientType: "STAFF" as const })));
  }
  const unique = new Map<string, Recipient>();
  for (const recipient of recipients) unique.set(`${recipient.recipientType}:${recipient.recipientRef}`, recipient);
  return [...unique.values()].slice(0, MAX_RECIPIENTS);
}

function destinationFor(channel: DeliveryChannel, recipient: Recipient): string | null {
  if (channel === "EMAIL") return recipient.email?.trim() || null;
  if (channel === "SMS") return recipient.phone?.trim() || null;
  return null;
}

function missingDestination(channel: DeliveryChannel): string | null {
  if (channel === "EMAIL") return "Recipient has no email address.";
  if (channel === "SMS") return "Recipient has no phone number.";
  return null;
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "You do not have permission to queue communications." }, { status: 403 });
  try {
    const body = await request.json();
    const noticeId = String(body.noticeId || "");
    const audience = String(body.audience || "ALL").trim().toUpperCase();
    const channels: DeliveryChannel[] = Array.isArray(body.channels)
      ? body.channels.map((value: unknown) => String(value)).filter((value: string): value is DeliveryChannel => CHANNELS.includes(value as DeliveryChannel))
      : [];
    if (!noticeId || !AUDIENCES.includes(audience as (typeof AUDIENCES)[number]) || channels.length === 0) return NextResponse.json({ error: "noticeId, a valid audience and at least one channel are required." }, { status: 400 });
    const notice = await prisma.communicationNotice.findUnique({ where: { id: noticeId } });
    if (!notice) return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    if (notice.status !== "PUBLISHED") return NextResponse.json({ error: "Only published notices can be queued for delivery." }, { status: 400 });
    const recipients = await resolveRecipients(audience);
    if (recipients.length === 0) return NextResponse.json({ error: "No active recipients match this audience." }, { status: 400 });
    const uniqueChannels: DeliveryChannel[] = [...new Set<DeliveryChannel>(channels)];
    const queuedIds: string[] = [];
    const failedIds: string[] = [];
    let skippedExisting = 0;
    for (const recipient of recipients) {
      for (const channel of uniqueChannels) {
        const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "CommunicationDelivery" WHERE "noticeId"=$1 AND "channel"=$2 AND "recipientType"=$3 AND "recipientRef"=$4 AND "status" IN ('QUEUED','SENT','DELIVERED') LIMIT 1`, noticeId, channel, recipient.recipientType, recipient.recipientRef);
        if (existing.length) { skippedExisting += 1; continue; }
        const destination = destinationFor(channel, recipient);
        const missing = missingDestination(channel);
        const error = missing && !destination ? missing : null;
        const status = error ? "FAILED" : "QUEUED";
        const id = randomUUID();
        await prisma.$executeRawUnsafe(`INSERT INTO "CommunicationDelivery" ("id","noticeId","channel","audience","recipientType","recipientRef","recipientName","destination","status","error","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`, id, noticeId, channel, audience, recipient.recipientType, recipient.recipientRef, recipient.recipientName, destination, status, error, user.id);
        if (error) failedIds.push(id); else queuedIds.push(id);
      }
    }
    await writeAuditLog({ userId: user.id, action: "COMMUNICATION_QUEUED", entityType: "CommunicationNotice", entityId: noticeId, metadata: { audience, channels: uniqueChannels, recipientCount: recipients.length, queued: queuedIds.length, failed: failedIds.length, skippedExisting }, context: requestAuditContext(request) });
    return NextResponse.json({ queued: queuedIds.length, failed: failedIds.length, skippedExisting, recipientCount: recipients.length, ids: queuedIds, failedIds, providerPending: queuedIds.length > 0 }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to queue communication delivery." }, { status: 500 });
  }
}