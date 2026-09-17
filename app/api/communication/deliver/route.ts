import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

const ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const CHANNELS = ["IN_APP", "EMAIL", "SMS"] as const;

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "You do not have permission to queue communications." }, { status: 403 });
  try {
    const body = await request.json();
    const noticeId = String(body.noticeId || "");
    const audience = String(body.audience || "ALL").trim();
    const channels = Array.isArray(body.channels) ? body.channels.map(String).filter((c: string) => CHANNELS.includes(c as (typeof CHANNELS)[number])) : [];
    if (!noticeId || !audience || channels.length === 0) return NextResponse.json({ error: "noticeId, audience and at least one channel are required." }, { status: 400 });
    const notice = await prisma.communicationNotice.findUnique({ where: { id: noticeId } });
    if (!notice) return NextResponse.json({ error: "Notice not found." }, { status: 404 });
    if (notice.status !== "PUBLISHED") return NextResponse.json({ error: "Only published notices can be queued for delivery." }, { status: 400 });
    const uniqueChannels = [...new Set(channels)];
    const ids: string[] = [];
    for (const channel of uniqueChannels) {
      const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "CommunicationDelivery" WHERE "noticeId"=$1 AND "channel"=$2 AND "audience"=$3 AND "status" IN ('QUEUED','SENT','DELIVERED') LIMIT 1`, noticeId, channel, audience);
      if (existing.length) continue;
      const id = randomUUID();
      await prisma.$executeRawUnsafe(`INSERT INTO "CommunicationDelivery" ("id","noticeId","channel","audience","status","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,'QUEUED',$5,NOW(),NOW())`, id, noticeId, channel, audience, user.id);
      ids.push(id);
    }
    await writeAuditLog({ userId: user.id, action: "COMMUNICATION_QUEUED", entityType: "CommunicationNotice", entityId: noticeId, metadata: { audience, channels: uniqueChannels, queuedIds: ids }, context: requestAuditContext(request) });
    return NextResponse.json({ queued: ids.length, skippedExisting: uniqueChannels.length - ids.length, ids }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to queue communication delivery." }, { status: 500 });
  }
}
