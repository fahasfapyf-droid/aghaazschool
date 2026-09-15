import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import type { UserRole } from "@prisma/client";

const COMMUNICATION_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"];

async function authorized() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, COMMUNICATION_ROLES)) return { response: NextResponse.json({ error: "You do not have permission to manage communications." }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  const q = request.nextUrl.searchParams.get("q")?.trim() || undefined;
  try {
    const notices = await prisma.communicationNotice.findMany({ where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }] } : undefined, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json(notices);
  } catch { return NextResponse.json({ error: "Unable to load communications." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const auth = await authorized();
  if (auth.response) return auth.response;
  const context = requestAuditContext(request);
  try {
    const body = await request.json();
    if (!body.title?.trim() || !body.message?.trim()) return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
    const status = body.status === "DRAFT" ? "DRAFT" : "PUBLISHED";
    const notice = await prisma.communicationNotice.create({ data: { title: body.title.trim(), message: body.message.trim(), audience: body.audience?.trim() || "ALL", status, publishedAt: status === "DRAFT" ? null : new Date() } });
    await writeAuditLog({ userId: auth.user.id, action: status === "PUBLISHED" ? "COMMUNICATION_PUBLISHED" : "COMMUNICATION_DRAFT_CREATED", entityType: "CommunicationNotice", entityId: notice.id, metadata: { audience: notice.audience, status: notice.status }, context });
    return NextResponse.json(notice, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to create notice." }, { status: 500 }); }
}
