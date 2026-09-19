import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentSession } from "@/lib/parent-session";


export async function GET() {
  const current = await getParentSession();
  if (!current) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const notifications = await prisma.$queryRawUnsafe(`SELECT d."id",d."title",d."message",d."status",d."createdAt",d."sentAt",d."deliveredAt",d."readAt",n."title" AS "noticeTitle" FROM "CommunicationDelivery" d LEFT JOIN "CommunicationNotice" n ON n."id"=d."noticeId" WHERE d."recipientType"='PARENT' AND d."recipientRef"=$1 AND d."channel"='IN_APP' AND d."status" IN ('QUEUED','SENT','DELIVERED') ORDER BY d."createdAt" DESC LIMIT 100`, current.applicationId);
    return NextResponse.json({ student: { name: current.studentName }, guardian: current.guardianName, notifications });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load parent notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const current = await getParentSession();
  if (!current) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Notification id is required." }, { status: 400 });
    const updated = await prisma.$queryRawUnsafe<Array<{ id: string; readAt: Date }>>(`UPDATE "CommunicationDelivery" SET "readAt"=COALESCE("readAt",NOW()),"updatedAt"=NOW() WHERE "id"=$1 AND "recipientType"='PARENT' AND "recipientRef"=$2 AND "channel"='IN_APP' RETURNING "id","readAt"`, id, current.applicationId);
    if (!updated.length) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    return NextResponse.json({ notification: updated[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to mark notification as read." }, { status: 500 });
  }
}
