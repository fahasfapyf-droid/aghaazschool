import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentSession } from "@/lib/parent-session";

export async function GET() {
  const session = await getParentSession();
  const enrollmentId = session?.enrollmentId;
  if (!enrollmentId) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const releases = await prisma.reportCardRelease.findMany({ where: { studentId: enrollmentId }, include: { session: true }, orderBy: { releasedAt: "desc" }, take: 20 });
    const school = await prisma.schoolSetting.findUnique({ where: { id: "default" }, select: { schoolName: true } });
    return NextResponse.json({
      schoolName: school?.schoolName || "Aghaaz School",
      reportCards: releases.map(release => ({
        id: release.id,
        sessionId: release.sessionId,
        sessionName: release.session.name,
        releasedAt: release.releasedAt,
        snapshot: release.snapshot,
      })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load report cards." }, { status: 500 });
  }
}
