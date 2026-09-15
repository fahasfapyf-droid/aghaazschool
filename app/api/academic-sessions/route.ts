import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.academicSession.findMany({
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json({ sessions });
}
