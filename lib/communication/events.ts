import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type ParentNotificationEvent = {
  eventKey: string;
  sourceRef: string;
  enrollmentId: string;
  title: string;
  message: string;
  createdBy?: string | null;
};

export type ApplicationNotificationEvent = {
  eventKey: string;
  sourceRef: string;
  applicationId: string;
  title: string;
  message: string;
  createdBy?: string | null;
};

type NotificationPreference = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  active: boolean;
};

async function getNotificationPreference(eventKey: string): Promise<NotificationPreference> {
  const rows = await prisma.$queryRawUnsafe<NotificationPreference[]>(
    `SELECT "inAppEnabled","emailEnabled","smsEnabled","active" FROM "CommunicationPreference" WHERE "eventKey"=$1 LIMIT 1`,
    eventKey,
  );
  return rows[0] ?? { inAppEnabled: true, emailEnabled: true, smsEnabled: true, active: true };
}

function enabledDestinations(preference: NotificationPreference, email: string | null | undefined, phone: string | null | undefined) {
  const destinations: Array<{ channel: "IN_APP" | "EMAIL" | "SMS"; destination: string | null }> = [];
  if (preference.active && preference.inAppEnabled) destinations.push({ channel: "IN_APP", destination: null });
  if (preference.active && preference.emailEnabled && email?.trim()) destinations.push({ channel: "EMAIL", destination: email.trim() });
  if (preference.active && preference.smsEnabled && phone?.trim()) destinations.push({ channel: "SMS", destination: phone.trim() });
  return destinations;
}

/** Queue an event notification for the student's guardian without claiming provider delivery. */
export async function queueParentNotification(event: ParentNotificationEvent) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: event.enrollmentId },
    include: { application: true },
  });
  if (!enrollment) return { created: false, reason: "ENROLLMENT_NOT_FOUND" as const };

  const application = enrollment.application;
  if (!application.guardianName?.trim()) return { created: false, reason: "GUARDIAN_NOT_FOUND" as const };

  const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "CommunicationDelivery" WHERE "eventKey"=$1 AND "sourceRef"=$2 AND "recipientType"='PARENT' AND "recipientRef"=$3 LIMIT 1`,
    event.eventKey,
    event.sourceRef,
    application.id,
  );
  if (existing.length) return { created: false, reason: "ALREADY_QUEUED" as const };

  const preference = await getNotificationPreference(event.eventKey);
  const destinations = enabledDestinations(preference, application.guardianEmail, application.guardianPhone);
  if (!destinations.length) return { created: false, reason: "DISABLED" as const };

  const notice = await prisma.communicationNotice.create({
    data: {
      title: event.title.trim(),
      message: event.message.trim(),
      audience: "PARENTS",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  for (const destination of destinations) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CommunicationDelivery" ("id","noticeId","channel","audience","recipientType","recipientRef","recipientName","destination","status","eventKey","sourceRef","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,'PARENTS','PARENT',$4,$5,$6,'QUEUED',$7,$8,$9,NOW(),NOW())`,
      randomUUID(), notice.id, destination.channel, application.id, application.guardianName.trim(), destination.destination,
      event.eventKey, event.sourceRef, event.createdBy ?? null,
    );
  }

  return { created: true, noticeId: notice.id, channelCount: destinations.length };
}

/** Queue an event notification directly for an admission applicant's guardian. */
export async function queueApplicationNotification(event: ApplicationNotificationEvent) {
  const application = await prisma.application.findUnique({ where: { id: event.applicationId } });
  if (!application) return { created: false, reason: "APPLICATION_NOT_FOUND" as const };
  if (!application.guardianName?.trim()) return { created: false, reason: "GUARDIAN_NOT_FOUND" as const };

  const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT "id" FROM "CommunicationDelivery" WHERE "eventKey"=$1 AND "sourceRef"=$2 AND "recipientType"='PARENT' AND "recipientRef"=$3 LIMIT 1`,
    event.eventKey,
    event.sourceRef,
    application.id,
  );
  if (existing.length) return { created: false, reason: "ALREADY_QUEUED" as const };

  const preference = await getNotificationPreference(event.eventKey);
  const destinations = enabledDestinations(preference, application.guardianEmail, application.guardianPhone);
  if (!destinations.length) return { created: false, reason: "DISABLED" as const };

  const notice = await prisma.communicationNotice.create({
    data: {
      title: event.title.trim(),
      message: event.message.trim(),
      audience: "PARENTS",
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  for (const destination of destinations) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "CommunicationDelivery" ("id","noticeId","channel","audience","recipientType","recipientRef","recipientName","destination","status","eventKey","sourceRef","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,'PARENTS','PARENT',$4,$5,$6,'QUEUED',$7,$8,$9,NOW(),NOW())`,
      randomUUID(), notice.id, destination.channel, application.id, application.guardianName.trim(), destination.destination,
      event.eventKey, event.sourceRef, event.createdBy ?? null,
    );
  }

  return { created: true, noticeId: notice.id, channelCount: destinations.length };
}
