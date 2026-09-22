import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import type { Prisma, UserRole } from "@prisma/client";

const operationSchema = z.object({
  operationKey: z.string().min(8).max(200),
  entityType: z.string().min(1).max(120),
  entityId: z.string().min(1).max(200),
  operationType: z.string().min(1).max(80),
  payload: z.unknown(),
  clientCreatedAt: z.string().datetime(),
});
const EDIT_ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"];
const schema = z.object({ deviceKey: z.string().min(16).max(200), operations: z.array(operationSchema).max(250) });

async function applyOperation(op: z.infer<typeof operationSchema>, userId: string) {
  if (op.operationType !== "UPDATE_STUDENT_PROFILE") return false;
  if (op.entityType !== "Application") throw new Error("UNSUPPORTED_ENTITY_TYPE");

  const payload = z.object({
    studentName: z.string().trim().min(1),
    guardianName: z.string().trim().min(1),
    guardianPhone: z.string().trim().min(1),
    guardianEmail: z.string().trim().nullable().optional(),
    previousSchool: z.string().trim().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable().optional(),
    legacy: z.record(z.string(), z.unknown()).optional(),
  }).safeParse(op.payload);
  if (!payload.success) throw new Error("INVALID_STUDENT_PROFILE_OPERATION");

  const data = payload.data;
  const dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
  if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) throw new Error("INVALID_DATE_OF_BIRTH");

  await prisma.$transaction(async tx => {
    const existing = await tx.application.findFirst({ where: { id: op.entityId, enrollment: { isNot: null } }, select: { id: true, formData: true } });
    if (!existing) throw new Error("STUDENT_NOT_FOUND");

    let formData: Prisma.InputJsonValue | undefined = existing.formData as Prisma.InputJsonValue;
    if (data.legacy !== undefined) {
      const current = existing.formData && typeof existing.formData === "object" && !Array.isArray(existing.formData) ? existing.formData as Record<string, unknown> : {};
      const currentLegacy = current.legacy && typeof current.legacy === "object" && !Array.isArray(current.legacy) ? current.legacy as Record<string, unknown> : {};
      formData = JSON.parse(JSON.stringify({ ...current, legacy: { ...currentLegacy, ...data.legacy } })) as Prisma.InputJsonValue;
    }

    await tx.application.update({
      where: { id: op.entityId },
      data: {
        studentName: data.studentName,
        dateOfBirth,
        gender: data.gender ?? null,
        guardianName: data.guardianName,
        guardianPhone: data.guardianPhone,
        guardianEmail: data.guardianEmail ?? null,
        previousSchool: data.previousSchool ?? null,
        ...(data.legacy !== undefined ? { formData } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: "UPDATE_STUDENT_PROFILE_OFFLINE_SYNC",
        entityType: "Application",
        entityId: op.entityId,
        metadata: { operationKey: op.operationKey, clientCreatedAt: op.clientCreatedAt },
      },
    });
  });

  return true;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAllowed(user.role, EDIT_ROLES)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid sync payload" }, { status: 400 });

  const device = await prisma.syncDevice.findUnique({ where: { deviceKey: body.data.deviceKey } });
  if (!device || (device.userId && device.userId !== user.id)) return NextResponse.json({ error: "Device not registered" }, { status: 403 });

  const accepted: string[] = [];
  const duplicate: string[] = [];
  const applied: string[] = [];
  const failed: { operationKey: string; error: string }[] = [];

  for (const op of body.data.operations) {
    const existing = await prisma.syncOperation.findUnique({ where: { operationKey: op.operationKey } });
    if (existing) {
      duplicate.push(op.operationKey);
      if (existing.status === "APPLIED") applied.push(op.operationKey);
      if (existing.status === "FAILED") failed.push({ operationKey: op.operationKey, error: existing.errorMessage || existing.errorCode || "SYNC_OPERATION_FAILED" });
      continue;
    }

    const record = await prisma.syncOperation.create({
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

    try {
      const didApply = await applyOperation(op, user.id);
      await prisma.syncOperation.update({
        where: { id: record.id },
        data: { status: didApply ? "APPLIED" : "PENDING", appliedAt: didApply ? new Date() : null },
      });
      if (didApply) applied.push(op.operationKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "SYNC_OPERATION_FAILED";
      await prisma.syncOperation.update({ where: { id: record.id }, data: { status: "FAILED", errorCode: message, errorMessage: message } });
      failed.push({ operationKey: op.operationKey, error: message });
    }
  }

  await prisma.syncDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), lastPushAt: new Date() } });
  return NextResponse.json({ accepted, duplicate, applied, failed, pending: accepted.length - applied.length - failed.length });
}
