import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { randomUUID } from "crypto";

const READ_ROLES = ["SUPER_ADMIN", "ADMIN", "TEACHER"] as const;
const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"] as const;
type Band = { id: string; schemeId: string; label: string; minPercentage: number; maxPercentage: number; points: number | null; pass: boolean; displayOrder: number };
type Scheme = { id: string; sessionId: string | null; name: string; description: string | null; active: boolean; bands: Band[] };

async function auth(roles: readonly string[]) {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };
  if (!roleAllowed(user.role, roles as never)) return { response: NextResponse.json({ error: "You do not have permission to manage grading schemes." }, { status: 403 }) };
  return { user };
}
function text(value: unknown, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function number(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : null; }

export async function GET(request: NextRequest) {
  const a = await auth(READ_ROLES); if ("response" in a) return a.response;
  try {
    const sessionId = text(request.nextUrl.searchParams.get("sessionId"), 100);
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "GradingScheme" WHERE ($1='' OR "sessionId"=$1 OR "sessionId" IS NULL) ORDER BY "active" DESC,"name" ASC`, sessionId);
    const ids = rows.map(row => String(row.id));
    const bands = ids.length ? await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`SELECT * FROM "GradingBand" WHERE "schemeId" = ANY($1::text[]) ORDER BY "schemeId","displayOrder","minPercentage" DESC`, ids) : [];
    const result: Scheme[] = rows.map(row => ({ id: String(row.id), sessionId: row.sessionId ? String(row.sessionId) : null, name: String(row.name), description: row.description ? String(row.description) : null, active: Boolean(row.active), bands: bands.filter(b => String(b.schemeId) === String(row.id)).map(b => ({ id: String(b.id), schemeId: String(b.schemeId), label: String(b.label), minPercentage: Number(b.minPercentage), maxPercentage: Number(b.maxPercentage), points: b.points === null ? null : Number(b.points), pass: Boolean(b.pass), displayOrder: Number(b.displayOrder) })) }));
    return NextResponse.json({ schemes: result });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load grading schemes." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const a = await auth(WRITE_ROLES); if ("response" in a) return a.response;
  try {
    const body = await request.json(); const action = text(body.action, 30); const user = a.user;
    if (action === "SCHEME") {
      const name = text(body.name), description = text(body.description, 1000), sessionId = text(body.sessionId, 100) || null;
      if (!name) return NextResponse.json({ error: "Scheme name is required." }, { status: 400 });
      if (sessionId && !(await prisma.academicSession.findUnique({ where: { id: sessionId }, select: { id: true } }))) return NextResponse.json({ error: "Academic session not found." }, { status: 400 });
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "GradingScheme" WHERE lower("name")=lower($1) AND COALESCE("sessionId",'')=COALESCE($2,'') LIMIT 1`, name, sessionId);
      if (existing[0]) return NextResponse.json({ error: "A grading scheme with this name already exists for this scope." }, { status: 409 });
      const id = randomUUID(); await prisma.$executeRawUnsafe(`INSERT INTO "GradingScheme" ("id","sessionId","name","description","active","createdBy","createdAt","updatedAt") VALUES ($1,$2,$3,$4,true,$5,NOW(),NOW())`, id, sessionId, name, description || null, user.id);
      await writeAuditLog({ userId: user.id, action: "CREATE_GRADING_SCHEME", entityType: "GradingScheme", entityId: id, metadata: { name, sessionId } });
      return NextResponse.json({ id }, { status: 201 });
    }
    if (action === "BAND") {
      const schemeId = text(body.schemeId, 100), label = text(body.label, 40); const min = number(body.minPercentage), max = number(body.maxPercentage), points = body.points === "" || body.points === null || body.points === undefined ? null : number(body.points); const pass = body.pass === undefined ? true : Boolean(body.pass); const displayOrder = Number.isInteger(body.displayOrder) ? Number(body.displayOrder) : 0;
      if (!schemeId || !label || min === null || max === null || min < 0 || max > 100 || min > max) return NextResponse.json({ error: "Band label and a valid 0–100 percentage range are required." }, { status: 400 });
      if (points !== null && points < 0) return NextResponse.json({ error: "Points cannot be negative." }, { status: 400 });
      const scheme = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "GradingScheme" WHERE "id"=$1 AND "active"=true LIMIT 1`, schemeId); if (!scheme[0]) return NextResponse.json({ error: "Active grading scheme not found." }, { status: 404 });
      const overlap = await prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "GradingBand" WHERE "schemeId"=$1 AND "minPercentage" <= $3 AND "maxPercentage" >= $2 LIMIT 1`, schemeId, min, max); if (overlap[0]) return NextResponse.json({ error: "This percentage range overlaps an existing grading band." }, { status: 409 });
      const id = randomUUID(); await prisma.$executeRawUnsafe(`INSERT INTO "GradingBand" ("id","schemeId","label","minPercentage","maxPercentage","points","pass","displayOrder","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())`, id, schemeId, label, min, max, points, pass, displayOrder);
      await writeAuditLog({ userId: user.id, action: "CREATE_GRADING_BAND", entityType: "GradingBand", entityId: id, metadata: { schemeId, label, min, max, points, pass } });
      return NextResponse.json({ id }, { status: 201 });
    }
    return NextResponse.json({ error: "Invalid grading action." }, { status: 400 });
  } catch (error) { console.error(error); return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save grading configuration." }, { status: 400 }); }
}
