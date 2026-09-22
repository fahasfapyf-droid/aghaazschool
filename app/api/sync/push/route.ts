import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const operationSchema = z.object({
  operationKey: z.string().min(8).max(200),
  entityType: z.string().min(1).max(120),
  entityId: z.string().min(1).max(200),
  operationType: z.string().min(1).max(80),
  payload: z.unknown(),
  clientCreatedAt: z.string().datetime(),
});
const schema = z.object({ deviceKey: z.string().min(16).max(200), operations: z.array(operationSchema).max(250) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid sync payload" }, { status: 400 });

  const device = await prisma.syncDevice.findUnique({ where: { deviceKey: body.data.deviceKey } });
  if (!device || (device.userId && device.userId !== user.id)) return NextResponse.json({ error: "Device not registered" }, { status: 403 });

  const accepted: string[] = [];
  const duplicate: string[] = [];
  for (const op of body.data.operations) {
    const existing = await prisma.syncOperation.findUnique({ where: { operationKey: op.operationKey } });
    if (existing) { duplicate.push(op.operationKey); continue; }
    await prisma.syncOperation.create({
      data: {
        operationKey: op.operationKey,
        deviceId: device.id,
        entityType: op.entityType,
        entityId: op.entityId,
        operationType: op.operationType,
        payload: op.payload as object,
        clientCreatedAt: new Date(op.clientCreatedAt),
        status: "PENDING",
      },
    });
    accepted.push(op.operationKey);
  }
  await prisma.syncDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), lastPushAt: new Date() } });
  return NextResponse.json({ accepted, duplicate, applied: [], pending: accepted.length });
}
