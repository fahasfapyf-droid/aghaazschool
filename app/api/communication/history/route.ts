import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

const ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "You do not have permission to view delivery history." }, { status: 403 });
  try {
    const status = request.nextUrl.searchParams.get("status")?.trim();
    const channel = request.nextUrl.searchParams.get("channel")?.trim();
    const params: unknown[] = [];
    const where: string[] = [];
    if (status) { params.push(status); where.push(`"status" = $${params.length}`); }
    if (channel) { params.push(channel); where.push(`"channel" = $${params.length}`); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await prisma.$queryRawUnsafe(`SELECT d.*, n."title" AS "noticeTitle" FROM "CommunicationDelivery" d LEFT JOIN "CommunicationNotice" n ON n."id" = d."noticeId" ${clause} ORDER BY d."createdAt" DESC LIMIT 200`, ...params);
    return NextResponse.json({ deliveries: rows });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load delivery history." }, { status: 500 });
  }
}
