import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string; title: string; message: string; type: string; href: string | null;
      sourceType: string | null; sourceId: string | null; readAt: Date | null; createdAt: Date;
    }>>(`SELECT "id","title","message","type","href","sourceType","sourceId","readAt","createdAt" FROM "UserNotification" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 100`, user.id);
    const unread = rows.filter(row => !row.readAt).length;
    return NextResponse.json({ notifications: rows, unread });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    const markAll = body.markAll === true;
    if (!id && !markAll) return NextResponse.json({ error: "Notification id or markAll is required." }, { status: 400 });

    if (markAll) {
      await prisma.$executeRawUnsafe(`UPDATE "UserNotification" SET "readAt"=COALESCE("readAt",NOW()) WHERE "userId"=$1 AND "readAt" IS NULL`, user.id);
      await writeAuditLog({ userId: user.id, action: "NOTIFICATIONS_MARKED_READ", entityType: "UserNotification", metadata: { all: true }, context: requestAuditContext(request) });
      return NextResponse.json({ ok: true, markedAll: true });
    }

    const updated = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`UPDATE "UserNotification" SET "readAt"=COALESCE("readAt",NOW()) WHERE "id"=$1 AND "userId"=$2 RETURNING "id"`, id, user.id);
    if (!updated.length) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    await writeAuditLog({ userId: user.id, action: "NOTIFICATION_MARKED_READ", entityType: "UserNotification", entityId: id, context: requestAuditContext(request) });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update notification." }, { status: 500 });
  }
}
