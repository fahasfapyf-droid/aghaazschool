import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

const ROLES = ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"] as const;
const CHANNELS = ["IN_APP", "EMAIL", "SMS"] as const;

async function auth() {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, [...ROLES])) return { response: NextResponse.json({ error: "You do not have permission to manage communication templates." }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const result = await auth();
  if (result.response) return result.response;
  try {
    const templates = await prisma.$queryRawUnsafe(`SELECT * FROM "CommunicationTemplate" WHERE "active" = true ORDER BY "updatedAt" DESC LIMIT 100`);
    return NextResponse.json({ templates });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load communication templates." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const result = await auth();
  if (result.response) return result.response;
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const channel = String(body.channel || "IN_APP");
    const audience = String(body.audience || "ALL").trim();
    const subject = body.subject ? String(body.subject).trim() : null;
    const templateBody = String(body.body || "").trim();
    if (name.length < 2 || name.length > 120 || !CHANNELS.includes(channel as (typeof CHANNELS)[number]) || !audience || !templateBody) return NextResponse.json({ error: "Name, valid channel, audience and body are required." }, { status: 400 });
    const id = randomUUID();
    await prisma.$executeRawUnsafe(`INSERT INTO "CommunicationTemplate" ("id","name","channel","audience","subject","body","active","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW(),NOW())`, id, name, channel, audience, subject, templateBody, result.user.id);
    await writeAuditLog({ userId: result.user.id, action: "COMMUNICATION_TEMPLATE_CREATED", entityType: "CommunicationTemplate", entityId: id, metadata: { name, channel, audience }, context: requestAuditContext(request) });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create communication template." }, { status: 500 });
  }
}
