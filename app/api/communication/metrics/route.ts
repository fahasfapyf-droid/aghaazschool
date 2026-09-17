import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

const ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!roleAllowed(user.role, [...ROLES])) return NextResponse.json({ error: "You do not have permission to view communication operations." }, { status: 403 });

  try {
    const [statusRows, channelRows, recentRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(`SELECT "status", COUNT(*)::bigint AS "count" FROM "CommunicationDelivery" GROUP BY "status" ORDER BY "status"`),
      prisma.$queryRawUnsafe<Array<{ channel: string; count: bigint }>>(`SELECT "channel", COUNT(*)::bigint AS "count" FROM "CommunicationDelivery" WHERE "createdAt" >= NOW() - INTERVAL '24 hours' GROUP BY "channel" ORDER BY "channel"`),
      prisma.$queryRawUnsafe<Array<{ status: string; count: bigint }>>(`SELECT "status", COUNT(*)::bigint AS "count" FROM "CommunicationDelivery" WHERE "createdAt" >= NOW() - INTERVAL '24 hours' GROUP BY "status" ORDER BY "status"`),
    ]);

    const toObject = (rows: Array<{ status?: string; channel?: string; count: bigint }>, key: "status" | "channel") => Object.fromEntries(rows.map((row) => [row[key], Number(row.count)]));
    return NextResponse.json({
      allTime: toObject(statusRows, "status"),
      last24Hours: toObject(recentRows, "status"),
      channelsLast24Hours: toObject(channelRows, "channel"),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load communication operations." }, { status: 500 });
  }
}
