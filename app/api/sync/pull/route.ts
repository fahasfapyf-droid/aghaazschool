import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({ deviceKey: z.string().min(16).max(200), since: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(500).default(250) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid sync request" }, { status: 400 });

  const device = await prisma.syncDevice.findUnique({ where: { deviceKey: body.data.deviceKey } });
  if (!device || (device.userId && device.userId !== user.id)) return NextResponse.json({ error: "Device not registered" }, { status: 403 });

  const since = body.data.since ? new Date(body.data.since) : new Date(0);
  const operations = await prisma.syncOperation.findMany({
    where: { receivedAt: { gt: since }, deviceId: { not: device.id }, status: { in: ["PENDING", "APPLIED"] } },
    orderBy: { receivedAt: "asc" },
    take: body.data.limit,
    select: { operationKey: true, entityType: true, entityId: true, operationType: true, payload: true, clientCreatedAt: true, receivedAt: true, status: true },
  });
  await prisma.syncDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), lastPullAt: new Date() } });
  return NextResponse.json({ serverTime: new Date().toISOString(), operations });
}
