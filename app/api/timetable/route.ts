import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const className = new URL(request.url).searchParams.get("class")?.trim();
  return NextResponse.json([]);
}

export async function POST() {
  return NextResponse.json({ error: "Timetable storage is not yet configured." }, { status: 501 });
}
