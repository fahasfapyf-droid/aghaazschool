import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { sendDelivery, type DeliveryChannel } from "@/lib/communication/providers";

const ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const MAX_BATCH = 100;
const MAX_ATTEMPTS = 3;

type DeliveryRow = {
  id: string;
  noticeId: string | null;
  channel: DeliveryChannel;
  recipientType: string | null;
  recipientRef: string | null;
  recipientName: string | null;
  destination: string | null;
  attemptCount: number;
};

type NoticeRow = { id: string; title: string; message: string };

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "You do not have permission to process communication delivery." }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const requestedLimit = Number(body.limit ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_BATCH) : 50;

    // Recover workers that stopped while sending. A delivery older than 15 minutes is safe to retry.
    await prisma.$executeRawUnsafe(`UPDATE "CommunicationDelivery" SET "status"='QUEUED', "updatedAt"=NOW() WHERE "status"='SENDING' AND "updatedAt" < NOW() - INTERVAL '15 minutes' AND "attemptCount" < $1`, MAX_ATTEMPTS);

    const deliveries = await prisma.$queryRawUnsafe<DeliveryRow[]>(`UPDATE "CommunicationDelivery" SET "status"='SENDING', "lastAttemptAt"=NOW(), "updatedAt"=NOW() WHERE "id" IN (SELECT "id" FROM "CommunicationDelivery" WHERE "status"='QUEUED' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW()) AND "attemptCount" < $1 ORDER BY "queuedAt" ASC FOR UPDATE SKIP LOCKED LIMIT $2) RETURNING "id","noticeId","channel","recipientType","recipientRef","recipientName","destination","attemptCount"`, MAX_ATTEMPTS, limit);

    let sent = 0;
    let failed = 0;
    let deferred = 0;
    for (const delivery of deliveries) {
      if (!delivery.noticeId) {
        await prisma.$executeRawUnsafe(`UPDATE "CommunicationDelivery" SET "status"='FAILED', "error"=$2, "attemptCount"="attemptCount"+1, "updatedAt"=NOW() WHERE "id"=$1`, delivery.id, "Communication notice no longer exists.");
        failed += 1;
        continue;
      }

      const notices = await prisma.$queryRawUnsafe<NoticeRow[]>(`SELECT "id","title","message" FROM "CommunicationNotice" WHERE "id"=$1 LIMIT 1`, delivery.noticeId);
      const notice = notices[0];
      if (!notice) {
        await prisma.$executeRawUnsafe(`UPDATE "CommunicationDelivery" SET "status"='FAILED', "error"=$2, "attemptCount"="attemptCount"+1, "updatedAt"=NOW() WHERE "id"=$1`, delivery.id, "Communication notice no longer exists.");
        failed += 1;
        continue;
      }

      try {
        const result = await sendDelivery({
          channel: delivery.channel,
          destination: delivery.destination,
          recipientName: delivery.recipientName,
          subject: notice.title,
          body: notice.message,
          noticeId: notice.id,
          deliveryId: delivery.id,
        });
        await prisma.$executeRawUnsafe(`UPDATE "CommunicationDelivery" SET "status"='SENT', "providerName"=$2, "providerMessageId"=$3, "sentAt"=NOW(), "error"=NULL, "nextAttemptAt"=NULL, "attemptCount"="attemptCount"+1, "updatedAt"=NOW() WHERE "id"=$1`, delivery.id, result.providerName, result.providerMessageId ?? null);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Delivery provider failed.";
        const nextAttemptMinutes = 2 ** delivery.attemptCount * 5;
        const exhausted = delivery.attemptCount + 1 >= MAX_ATTEMPTS;
        await prisma.$executeRawUnsafe(`UPDATE "CommunicationDelivery" SET "status"=$2, "error"=$3, "attemptCount"="attemptCount"+1, "nextAttemptAt"=$4, "updatedAt"=NOW() WHERE "id"=$1`, delivery.id, exhausted ? "FAILED" : "QUEUED", message, exhausted ? null : new Date(Date.now() + nextAttemptMinutes * 60_000));
        if (exhausted) failed += 1; else deferred += 1;
      }
    }

    await writeAuditLog({ userId: user.id, action: "COMMUNICATION_DELIVERY_PROCESSED", entityType: "CommunicationDelivery", entityId: "batch", metadata: { attempted: deliveries.length, sent, failed, deferred }, context: requestAuditContext(request) });
    return NextResponse.json({ attempted: deliveries.length, sent, failed, deferred, remaining: deliveries.length === limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to process communication delivery." }, { status: 500 });
  }
}
