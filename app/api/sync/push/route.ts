import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import type { Prisma, UserRole } from "@prisma/client";
import { admissionCreateSchema, applicationNumber, enquiryNumber } from "@/lib/admissions";

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
  if (op.entityType !== "Application") throw new Error("UNSUPPORTED_ENTITY_TYPE");

  if (op.operationType === "UPDATE_STUDENT_PROFILE") {
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

    return { applicationId: op.entityId, operationType: op.operationType };
  }

  if (op.operationType === "CREATE_ADMISSION") {
    const parsed = admissionCreateSchema.safeParse(op.payload);
    if (!parsed.success) {\n      const fields = Object.keys(parsed.error.flatten().fieldErrors);\n      throw new Error(`INVALID_ADMISSION_OPERATION${fields.length ? `:${fields.join(",")}` : ""}`);\n    }

    const data = parsed.data;
    const dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : undefined;
    if (dateOfBirth && Number.isNaN(dateOfBirth.getTime())) throw new Error("INVALID_DATE_OF_BIRTH");

    const result = await prisma.$transaction(async tx => {
      const year = new Date().getFullYear();
      const session = await tx.academicSession.upsert({
        where: { name: data.sessionName },
        update: {},
        create: { name: data.sessionName, startDate: new Date(`${year}-08-01`), endDate: new Date(`${year + 1}-07-31`) },
      });

      const enquiry = await tx.admissionEnquiry.create({
        data: {
          enquiryNumber: enquiryNumber(),
          studentName: data.studentName,
          dateOfBirth,
          gender: data.gender,
          guardianName: data.guardianName,
          guardianPhone: data.guardianPhone,
          guardianEmail: data.guardianEmail || undefined,
          desiredClass: data.desiredClass,
          source: "admission_form_offline_sync",
          notes: data.remarks || undefined,
        },
      });

      const application = await tx.application.create({
        data: {
          applicationNumber: applicationNumber(),
          enquiryId: enquiry.id,
          sessionId: session.id,
          desiredClass: data.desiredClass,
          studentName: data.studentName,
          dateOfBirth,
          gender: data.gender,
          guardianName: data.guardianName,
          guardianPhone: data.guardianPhone,
          guardianEmail: data.guardianEmail || undefined,
          previousSchool: data.previousSchool || undefined,
          remarks: data.remarks || undefined,
          photoDataUrl: data.photoDataUrl || undefined,
          formData: data.formData ? JSON.parse(JSON.stringify(data.formData)) : undefined,
          status: "UNDER_REVIEW",
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "ADMISSION_APPLICATION_CREATED_OFFLINE_SYNC",
          entityType: "Application",
          entityId: application.id,
          metadata: { operationKey: op.operationKey, localEntityId: op.entityId, applicationNumber: application.applicationNumber, enquiryNumber: enquiry.enquiryNumber },
        },
      });

      return { applicationId: application.id, applicationNumber: application.applicationNumber, enquiryNumber: enquiry.enquiryNumber };
    });

    return { ...result, operationType: op.operationType };
  }

  throw new Error("UNSUPPORTED_SYNC_OPERATION");
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
  const results: { operationKey: string; operationType: string; applicationId: string; applicationNumber?: string; enquiryNumber?: string }[] = [];
  const failed: { operationKey: string; error: string }[] = [];

  for (const op of body.data.operations) {
    const existing = await prisma.syncOperation.findUnique({ where: { operationKey: op.operationKey } });
    if (existing?.status === "APPLIED") {
      duplicate.push(op.operationKey);
      applied.push(op.operationKey);
      continue;
    }

    let record = existing;
    if (existing?.status === "FAILED") {
      record = await prisma.syncOperation.update({
        where: { id: existing.id },
        data: {
          status: "PENDING",
          errorCode: null,
          errorMessage: null,
          appliedAt: null,
        },
      });
    } else if (!existing) {
      record = await prisma.syncOperation.create({
        data: {
          operationKey: op.operationKey,
          deviceId: device.id,
          entityType: op.entityType,
          entityId: op.entityId,
          operationType: op.operationType,
          payload: op.payload as object,
          clientCreatedAt: new Date(op.clientCreatedAt),
          status: "PENDING",
          lastAttemptAt: new Date(),
        },
      });
    } else {
      duplicate.push(op.operationKey);
      continue;
    }
    accepted.push(op.operationKey);

    try {
      const result = await applyOperation(op, user.id);
      await prisma.syncOperation.update({ where: { id: record.id }, data: { status: "APPLIED", appliedAt: new Date() } });
      applied.push(op.operationKey);
      if (result && "applicationId" in result) results.push({ operationKey: op.operationKey, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SYNC_OPERATION_FAILED";
      await prisma.syncOperation.update({ where: { id: record.id }, data: { status: "FAILED", errorCode: message, errorMessage: message } });
      failed.push({ operationKey: op.operationKey, error: message });
    }
  }

  await prisma.syncDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(), lastPushAt: new Date() } });
  return NextResponse.json({ accepted, duplicate, applied, results, failed, pending: accepted.length - applied.length - failed.length });
}
