import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const logs = await prisma.auditLog.findMany({
      where: q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { entityType: { contains: q, mode: "insensitive" } }, { entityId: { contains: q, mode: "insensitive" } }] } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true, role: true } } },
    });
    return NextResponse.json({ logs });
  } catch (error) {
    const status = error instanceof Error && error.message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: status === 403 ? "Administrator access required." : "Authentication required." }, { status });
  }
}
