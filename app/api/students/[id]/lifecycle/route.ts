import { NextRequest, NextResponse } from "next/server";
import { POST as enrollmentActionsPost } from "@/app/api/enrollment-actions/route";

type LegacyAction = "PROMOTE" | "TRANSFER" | "WITHDRAW" | "REACTIVATE";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action as LegacyAction : null;

  if (!action || !["PROMOTE", "TRANSFER", "WITHDRAW", "REACTIVATE"].includes(action)) {
    return NextResponse.json({ error: "Invalid lifecycle action." }, { status: 400 });
  }

  const canonicalBody = {
    action,
    enrollmentId: id,
    targetSessionId: typeof body?.sessionId === "string" ? body.sessionId : undefined,
    targetGradeId: typeof body?.gradeId === "string" ? body.gradeId : undefined,
    targetSectionId: typeof body?.sectionId === "string" ? body.sectionId : undefined,
    note: typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : undefined,
  };

  const canonicalRequest = new NextRequest(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(canonicalBody),
  });

  const response = await enrollmentActionsPost(canonicalRequest);
  if (!response.ok) return response;

  const result = await response.json();
  return NextResponse.json({
    ok: true,
    action,
    status: result.enrollment?.status ?? null,
    enrollmentId: result.enrollment?.id ?? id,
  }, { status: 200 });
}
