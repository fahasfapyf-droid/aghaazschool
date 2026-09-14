import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || undefined;
    const className = searchParams.get("class")?.trim() || undefined;

    const students = await prisma.application.findMany({
      where: {
        enrollment: { isNot: null },
        ...(q ? { OR: [{ studentName: { contains: q, mode: "insensitive" } }, { guardianName: { contains: q, mode: "insensitive" } }, { guardianPhone: { contains: q, mode: "insensitive" } }] } : {}),
        ...(className ? { enrollment: { is: { className } } } : {}),
      },
      include: { enrollment: true, session: true },
      orderBy: { studentName: "asc" },
      take: 500,
    });

    return NextResponse.json(students);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load students. Check DATABASE_URL and Prisma migration state." }, { status: 500 });
  }
}
