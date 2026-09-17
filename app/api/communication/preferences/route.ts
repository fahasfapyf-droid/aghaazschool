import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

async function auth() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, [...ROLES])) return { response: NextResponse.json({ error: "You do not have permission to manage notification preferences." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const result = await auth();
  if (result.response) return result.response;
  try {
    const preferences = await prisma.$queryRawUnsafe(`SELECT "id","eventKey","label","description","inAppEnabled","emailEnabled","smsEnabled","active","updatedAt" FROM "CommunicationPreference" ORDER BY "label" ASC`);
    return NextResponse.json({ preferences });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load notification preferences." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const result = await auth();
  if (result.response) return result.response;
  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Preference id is required." }, { status: 400 });

    const current = await prisma.$queryRawUnsafe<Array<{ id: string; eventKey: string }>>(`SELECT "id","eventKey" FROM "CommunicationPreference" WHERE "id"=$1 LIMIT 1`, id);
    if (!current.length) return NextResponse.json({ error: "Notification preference not found." }, { status: 404 });

    const booleanOrUndefined = (value: unknown) => typeof value === "boolean" ? value : undefined;
    const inAppEnabled = booleanOrUndefined(body.inAppEnabled);
    const emailEnabled = booleanOrUndefined(body.emailEnabled);
    const smsEnabled = booleanOrUndefined(body.smsEnabled);
    const active = booleanOrUndefined(body.active);
    if ([inAppEnabled, emailEnabled, smsEnabled, active].every((value) => value === undefined)) {
      return NextResponse.json({ error: "At least one preference value is required." }, { status: 400 });
    }

    const updated = await prisma.$queryRawUnsafe<Array<{ id: string; eventKey: string; inAppEnabled: boolean; emailEnabled: boolean; smsEnabled: boolean; active: boolean }>>(
      `UPDATE "CommunicationPreference" SET "inAppEnabled"=COALESCE($2,"inAppEnabled"), "emailEnabled"=COALESCE($3,"emailEnabled"), "smsEnabled"=COALESCE($4,"smsEnabled"), "active"=COALESCE($5,"active"), "updatedBy"=$6, "updatedAt"=NOW() WHERE "id"=$1 RETURNING "id","eventKey","inAppEnabled","emailEnabled","smsEnabled","active"`,
      id, inAppEnabled ?? null, emailEnabled ?? null, smsEnabled ?? null, active ?? null, result.user.id,
    );

    await writeAuditLog({
      userId: result.user.id,
      action: "COMMUNICATION_PREFERENCE_UPDATED",
      entityType: "CommunicationPreference",
      entityId: id,
      metadata: { eventKey: current[0].eventKey, changes: { inAppEnabled, emailEnabled, smsEnabled, active } },
      context: requestAuditContext(request),
    });

    return NextResponse.json({ preference: updated[0] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to update notification preference." }, { status: 500 });
  }
}
