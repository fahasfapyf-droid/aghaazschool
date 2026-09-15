import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

function canManage(role?: string) { return role === "SUPER_ADMIN" || role === "ADMIN"; }

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if (!canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null); const id = body && typeof body.id === "string" ? body.id.trim() : ""; const subject = body && typeof body.subject === "string" ? body.subject.trim() : "";
  if (!id || !subject) return NextResponse.json({ error: "id and subject are required" }, { status: 400 });
  const existing = await prisma.reportCardSubject.findUnique({ where: { id } }); if (!existing) return NextResponse.json({ error: "Subject configuration not found" }, { status: 404 }); if (existing.subject.toLowerCase() === subject.toLowerCase()) return NextResponse.json({ subject: existing });
  const duplicate = await prisma.reportCardSubject.findFirst({ where: { sessionId: existing.sessionId, className: existing.className, section: existing.section, term: existing.term, subject, id: { not: id }, active: true }, select: { id: true } }); if (duplicate) return NextResponse.json({ error: "A subject with this name already exists for this term and scope" }, { status: 409 });
  const exams = await prisma.exam.findMany({ where: { sessionId: existing.sessionId, term: existing.term }, select: { id: true } });
  try { const updated = await prisma.$transaction(async tx => { const papers = await tx.examPaper.findMany({ where: { examId: { in: exams.map(exam => exam.id) }, className: existing.className, subject: existing.subject }, select: { id: true } }); const config = await tx.reportCardSubject.update({ where: { id }, data: { subject }, include: { components: { orderBy: { displayOrder: "asc" } } } }); for (const paper of papers) await tx.examPaper.update({ where: { id: paper.id }, data: { subject } }); return config; }); return NextResponse.json({ subject: updated }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to rename subject" }, { status: 400 }); }
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); if (!canManage(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim(); if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const existing = await prisma.reportCardSubject.findUnique({ where: { id } }); if (!existing) return NextResponse.json({ error: "Subject configuration not found" }, { status: 404 });
  const subject = await prisma.reportCardSubject.update({ where: { id }, data: { active: false } }); return NextResponse.json({ removed: true, id, subject: subject.subject });
}
