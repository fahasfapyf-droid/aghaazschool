import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type UserNotificationInput = {
  userId: string;
  title: string;
  message: string;
  type?: string;
  href?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
};

export async function createUserNotification(input: UserNotificationInput) {
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "UserNotification" ("id","userId","title","message","type","href","sourceType","sourceId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    id,
    input.userId,
    input.title.trim().slice(0, 200),
    input.message.trim().slice(0, 2000),
    input.type?.trim() || "INFO",
    input.href ?? null,
    input.sourceType ?? null,
    input.sourceId ?? null,
  );
  return id;
}

/** Notify a staff member using the explicit staff-to-user link; email is retained only as a legacy fallback. */
export async function notifyStaffByStaffId(staffId: string, input: Omit<UserNotificationInput, "userId">) {
  const linked = await prisma.$queryRawUnsafe<Array<{ userId: string }>>(
    `SELECT s."userId" FROM "Staff" s JOIN "User" u ON u."id"=s."userId" WHERE s."id"=$1 AND u."active"=true LIMIT 1`, staffId,
  );
  let userId = linked[0]?.userId;
  if (!userId) {
    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { email: true } });
    const email = staff?.email?.trim();
    if (!email) return { created: false, reason: "STAFF_ACCOUNT_NOT_LINKED" as const };
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, active: true }, select: { id: true } });
    userId = user?.id;
  }
  if (!userId) return { created: false, reason: "USER_ACCOUNT_NOT_FOUND" as const };
  const id = await createUserNotification({ ...input, userId });
  return { created: true, id, userId };
}
