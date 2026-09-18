import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";

const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

function authorizedByCron(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  try {
    const cronAuthorized = authorizedByCron(request);
    if (!cronAuthorized) {
      const user = await getCurrentUser();
      if (!user || !roleAllowed(user.role, [...ADMIN_ROLES])) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
      }
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextWeek = new Date(startOfDay.getTime() + 7 * 86400000);

    const [overdueFees, overdueHomework, upcomingEvents, openActions, staffExceptions, activeAdmissions, admins] = await Promise.all([
      prisma.feeInvoice.count({
        where: { dueDate: { lt: startOfDay }, status: { notIn: ["PAID", "CANCELLED"] } },
      }),
      prisma.homework.count({
        where: {
          dueDate: { lt: startOfDay },
          status: { not: "DRAFT" },
          submissions: { none: { status: { not: "REVIEWED" } } },
        },
      }),
      prisma.$queryRawUnsafe<Array<{ id: string; title: string; eventType: string; startAt: Date }>>(
        `SELECT "id","title","eventType","startAt"
         FROM "SchoolEvent"
         WHERE "status"='PUBLISHED' AND "startAt">=$1 AND "startAt"<$2
         ORDER BY "startAt" ASC LIMIT 5`,
        startOfDay,
        nextWeek,
      ).catch(() => []),
      prisma.$queryRawUnsafe<Array<{ id: string; title: string; category: string; dueDate: Date | null }>>(
        `SELECT "id","title","category","dueDate"
         FROM "MonitorAction"
         WHERE "status" IN ('OPEN','IN_PROGRESS')
         ORDER BY CASE WHEN "dueDate" IS NULL THEN 1 ELSE 0 END,"dueDate" ASC,"createdAt" DESC LIMIT 5`,
      ).catch(() => []),
      prisma.$queryRawUnsafe<Array<{ staffId: string; staffName: string; status: string; date: Date }>>(
        `SELECT sa."staffId",s."name" AS "staffName",sa."status",sa."date"
         FROM "StaffAttendance" sa
         JOIN "Staff" s ON s."id"=sa."staffId"
         WHERE sa."date">=$1 AND sa."status" IN ('ABSENT','LATE','HALF_DAY')
         ORDER BY sa."date" DESC LIMIT 10`,
        new Date(startOfDay.getTime() - 7 * 86400000),
      ).catch(() => []),
      prisma.application.count({
        where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] } },
      }).catch(() => 0),
      prisma.user.findMany({
        where: { active: true, role: { in: ["SUPER_ADMIN", "ADMIN"] } },
        select: { id: true },
      }),
    ]);

    const sourceId = `daily-brief:${startOfDay.toISOString().slice(0, 10)}`;
    const signalCount = overdueFees + overdueHomework + openActions.length + staffExceptions.length + activeAdmissions;
    const eventText = upcomingEvents.length
      ? ` ${upcomingEvents.length} school event(s) are scheduled in the next 7 days.`
      : " No published school events are scheduled in the next 7 days.";
    const actionText = openActions.length
      ? ` ${openActions.length} Monitor action(s) remain open or in progress.`
      : " There are no open Monitor actions.";
    const staffText = staffExceptions.length
      ? ` ${staffExceptions.length} staff attendance exception(s) were recorded in the last 7 days.`
      : " There are no staff attendance exceptions in the last 7 days.";
    const admissionsText = activeAdmissions
      ? ` ${activeAdmissions} admission application(s) are currently active in the workflow.`
      : " There are no active admission applications.";
    const message =
      `Daily operating brief: ${overdueFees} overdue fee invoice(s), ${overdueHomework} overdue homework item(s).` +
      eventText +
      actionText +
      staffText +
      admissionsText;

    if (!cronAuthorized) {
      return NextResponse.json({
        generatedAt: now.toISOString(),
        sourceId,
        signalCount,
        deliveredTo: 0,
        preview: { overdueFees, overdueHomework, upcomingEvents, openActions, staffExceptions, activeAdmissions },
      });
    }

    let deliveredTo = 0;
    for (const admin of admins) {
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "UserNotification"
         WHERE "userId"=$1 AND "sourceType"='DailyBrief' AND "sourceId"=$2
         LIMIT 1`,
        admin.id,
        sourceId,
      );
      if (existing.length) continue;

      await prisma.$executeRawUnsafe(
        `INSERT INTO "UserNotification"
         ("id","userId","title","message","type","href","sourceType","sourceId","createdAt")
         VALUES ($1,$2,$3,$4,'BRIEF','/reports','DailyBrief',$5,NOW())`,
        randomUUID(),
        admin.id,
        "Daily Operating Brief",
        message,
        sourceId,
      );
      deliveredTo += 1;
    }

    return NextResponse.json({
      generatedAt: now.toISOString(),
      sourceId,
      signalCount,
      deliveredTo,
      summary: { overdueFees, overdueHomework, upcomingEvents, openActions, staffExceptions, activeAdmissions },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to generate daily operating brief." }, { status: 500 });
  }
}
