import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const adminRoles = new Set(["SUPER_ADMIN", "ADMIN"]);
const allowedTransitions: Record<string, string[]> = {
  DRAFT: ["SCHEDULED"],
  SCHEDULED: ["PUBLISHED"],
  PUBLISHED: ["SCHEDULED"],
};

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const exam = await prisma.exam.findUnique({
    where: { id },
    include: {
      session: true,
      papers: {
        include: {
          results: {
            include: { components: true, student: { include: { application: true } } },
            orderBy: { student: { application: { studentName: "asc" } } },
          },
        },
      },
    },
  });
  if (!exam) return NextResponse.json({ error: "Examination not found" }, { status: 404 });
  return NextResponse.json(exam);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!adminRoles.has(user.role)) return NextResponse.json({ error: "Only administrators can change examination status" }, { status: 403 });

    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const current = await prisma.exam.findUnique({ where: { id }, include: { _count: { select: { papers: true } } } });
    if (!current) return NextResponse.json({ error: "Examination not found" }, { status: 404 });

    if (body.status && body.status !== current.status) {
      const allowed = allowedTransitions[current.status] || [];
      if (!allowed.includes(body.status)) {
        return NextResponse.json({ error: `Invalid examination status transition: ${current.status} → ${body.status}` }, { status: 400 });
      }
      if (body.status === "PUBLISHED" && current._count.papers === 0) {
        return NextResponse.json({ error: "An examination must have at least one paper before it can be published" }, { status: 400 });
      }
    }

    const startDate = body.startDate ? new Date(body.startDate) : current.startDate;
    const endDate = body.endDate ? new Date(body.endDate) : current.endDate;
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
      return NextResponse.json({ error: "Invalid examination dates" }, { status: 400 });
    }

    const exam = await prisma.exam.update({
      where: { id },
      data: {
        name: body.name,
        status: body.status,
        startDate,
        endDate,
      },
      include: { session: true, _count: { select: { papers: true } } },
    });

    if (body.status && body.status !== current.status) {
      await writeAuditLog({
        userId: user.id,
        action: body.status === "PUBLISHED" ? "EXAM_PUBLISHED" : "EXAM_UNPUBLISHED",
        entityType: "Exam",
        entityId: exam.id,
        metadata: { from: current.status, to: body.status, paperCount: current._count.papers },
        context: requestAuditContext(req),
      });
    } else if (body.name || body.startDate || body.endDate) {
      await writeAuditLog({
        userId: user.id,
        action: "EXAM_UPDATED",
        entityType: "Exam",
        entityId: exam.id,
        metadata: { nameChanged: Boolean(body.name), datesChanged: Boolean(body.startDate || body.endDate) },
        context: requestAuditContext(req),
      });
    }

    return NextResponse.json(exam);
  } catch (e) {
    return NextResponse.json({ error: e instanceof z.ZodError ? "Invalid examination update" : e instanceof Error ? e.message : "Unable to update examination" }, { status: 400 });
  }
}
