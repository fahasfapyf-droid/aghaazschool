import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const schema = z.object({ deviceKey: z.string().min(16).max(200), name: z.string().min(1).max(120) });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid device registration" }, { status: 400 });

  const device = await prisma.syncDevice.upsert({
    where: { deviceKey: body.data.deviceKey },
    update: { name: body.data.name, userId: user.id, lastSeenAt: new Date() },
    create: { deviceKey: body.data.deviceKey, name: body.data.name, userId: user.id },
  });
  return NextResponse.json({ deviceId: device.id, deviceKey: device.deviceKey, serverTime: new Date().toISOString() });
}
