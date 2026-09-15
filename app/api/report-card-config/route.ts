import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const terms = ["FIRST", "SECOND", "THIRD"] as const;
type AcademicTerm = (typeof terms)[number];

type NormalizedComponent = {
  name: string;
  maxMarks: number;
  displayOrder: number;
};

function canManage(role?: string) {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const className = searchParams.get("className");
  const section = searchParams.get("section");
  const term = searchParams.get("term");

  if (!sessionId) return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  if (term && !terms.includes(term as AcademicTerm)) {
    return NextResponse.json({ error: "Invalid academic term" }, { status: 400 });
  }

  const subjects = await prisma.reportCardSubject.findMany({
    where: {
      sessionId,
      ...(className ? { className } : {}),
      ...(section ? { section } : {}),
      ...(term ? { term: term as AcademicTerm } : {}),
    },
    include: { components: { orderBy: { displayOrder: "asc" } } },
    orderBy: [{ term: "asc" }, { displayOrder: "asc" }, { subject: "asc" }],
  });

  return NextResponse.json({ subjects });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const className = typeof body.className === "string" ? body.className.trim() : "";
  const section = typeof body.section === "string" && body.section.trim() ? body.section.trim() : null;
  const term = typeof body.term === "string" ? body.term : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const maxMarks = Number(body.maxMarks);
  const displayOrder = Number.isInteger(body.displayOrder) ? body.displayOrder : 0;
  const active = body.active === undefined ? true : Boolean(body.active);
  const components = Array.isArray(body.components) ? body.components : [];

  if (!sessionId || !className || !subject || !terms.includes(term as AcademicTerm)) {
    return NextResponse.json({ error: "sessionId, className, term and subject are required" }, { status: 400 });
  }
  if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
    return NextResponse.json({ error: "maxMarks must be greater than zero" }, { status: 400 });
  }

  const normalizedComponents: NormalizedComponent[] = components.map((component: unknown, index: number) => {
    const item = component as Record<string, unknown>;
    return {
      name: typeof item.name === "string" ? item.name.trim() : "",
      maxMarks: Number(item.maxMarks),
      displayOrder: Number.isInteger(item.displayOrder) ? Number(item.displayOrder) : index,
    };
  });

  if (normalizedComponents.some((component: NormalizedComponent) => !component.name || !Number.isFinite(component.maxMarks) || component.maxMarks <= 0)) {
    return NextResponse.json({ error: "Every assessment component needs a name and positive max marks" }, { status: 400 });
  }

  const componentTotal = normalizedComponents.reduce((sum: number, component: NormalizedComponent) => sum + component.maxMarks, 0);
  if (normalizedComponents.length && Math.abs(componentTotal - maxMarks) > 0.001) {
    return NextResponse.json({ error: "Assessment component maximums must equal the subject maximum marks" }, { status: 400 });
  }

  const existing = await prisma.reportCardSubject.findFirst({
    where: { sessionId, className, section, term: term as AcademicTerm, subject },
    select: { id: true },
  });

  const config = existing
    ? await prisma.reportCardSubject.update({
        where: { id: existing.id },
        data: {
          maxMarks,
          displayOrder,
          active,
          components: {
            deleteMany: {},
            create: normalizedComponents,
          },
        },
        include: { components: { orderBy: { displayOrder: "asc" } } },
      })
    : await prisma.reportCardSubject.create({
        data: {
          sessionId,
          className,
          section,
          term: term as AcademicTerm,
          subject,
          maxMarks,
          displayOrder,
          active,
          components: { create: normalizedComponents },
        },
        include: { components: { orderBy: { displayOrder: "asc" } } },
      });

  return NextResponse.json({ subject: config }, { status: existing ? 200 : 201 });
}
