import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function writeAuditLog(input: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  context?: AuditContext;
}) {
  try {
    const metadata = input.metadata == null
      ? undefined
      : (JSON.parse(JSON.stringify(input.metadata)) as Prisma.InputJsonValue);

    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata,
        ipAddress: input.context?.ipAddress ?? null,
        userAgent: input.context?.userAgent ?? null,
      },
    });
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}

export function requestAuditContext(request: Request): AuditContext {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() || realIp || null,
    userAgent: request.headers.get("user-agent"),
  };
}
