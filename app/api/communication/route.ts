import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.trim() || undefined;
  try {
    const notices = await prisma.communicationNotice.findMany({ where: q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { message: { contains: q, mode: "insensitive" } }] } : undefined, orderBy: { createdAt: "desc" }, take: 100 });
    return NextResponse.json(notices);
  } catch { return NextResponse.json({ error: "Unable to load communications." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title?.trim() || !body.message?.trim()) return NextResponse.json({ error: "Title and message are required." }, { status: 400 });
    const notice = await prisma.communicationNotice.create({ data: { title: body.title.trim(), message: body.message.trim(), audience: body.audience?.trim() || "ALL", status: body.status === "DRAFT" ? "DRAFT" : "PUBLISHED", publishedAt: body.status === "DRAFT" ? null : new Date() } });
    return NextResponse.json(notice, { status: 201 });
  } catch { return NextResponse.json({ error: "Unable to create notice." }, { status: 500 }); }
}
