import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentSession } from "@/lib/parent-session";

const COOKIE = "aghaaz_parent_session";
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
async function getEnrollment() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await prisma.$queryRawUnsafe<Array<{ enrollmentId: string }>>(`SELECT p."enrollmentId" FROM "ParentAccessToken" p JOIN "Enrollment" e ON e."id"=p."enrollmentId" WHERE p."tokenHash"=$1 AND p."revokedAt" IS NULL AND p."expiresAt">NOW() AND e."status" NOT IN ('WITHDRAWN','TRANSFERRED') LIMIT 1`, hashToken(token));
  return rows[0]?.enrollmentId || null;
}
export async function GET() {
  const session = await getParentSession();
  const enrollmentId = session?.enrollmentId;
  if (!enrollmentId) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const records = await prisma.attendance.findMany({ where: { studentId: enrollmentId }, orderBy: { date: "desc" }, take: 120 });
    const present = records.filter(item => item.status === "PRESENT" || item.status === "LATE").length;
    return NextResponse.json({ summary: { total: records.length, present, absent: records.filter(item => item.status === "ABSENT").length, late: records.filter(item => item.status === "LATE").length, excused: records.filter(item => item.status === "EXCUSED").length, rate: records.length ? Math.round((present / records.length) * 100) : null }, records: records.map(item => ({ id: item.id, date: item.date, status: item.status, remarks: item.remarks })) });
  } catch (error) { console.error(error); return NextResponse.json({ error: "Unable to load attendance detail." }, { status: 500 }); }
}
