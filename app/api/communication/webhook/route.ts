import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STATUSES = ["DELIVERED", "FAILED"] as const;

export async function POST(request: NextRequest) {
  const secret = process.env.COMMUNICATION_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Communication webhook secret is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });

  try {
    const body = await request.json();
    const providerMessageId = String(body.providerMessageId || "").trim();
    const status = String(body.status || "").trim().toUpperCase();
    const error = typeof body.error === "string" ? body.error.trim() : null;
    if (!providerMessageId || !STATUSES.includes(status as (typeof STATUSES)[number])) return NextResponse.json({ error: "providerMessageId and a valid status are required." }, { status: 400 });

    const result = await prisma.$executeRawUnsafe(`UPDATE "CommunicationDelivery" SET "status"=$2, "deliveredAt"=CASE WHEN $2='DELIVERED' THEN NOW() ELSE "deliveredAt" END, "error"=$3, "updatedAt"=NOW() WHERE "providerMessageId"=$1`, providerMessageId, status, error);
    if (result === 0) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    return NextResponse.json({ updated: result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to process delivery webhook." }, { status: 500 });
  }
}
