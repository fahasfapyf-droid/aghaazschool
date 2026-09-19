import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getParentSession } from "@/lib/parent-session";

export async function GET() {
  const session = await getParentSession();
  const enrollmentId = session?.enrollmentId;
  if (!enrollmentId) return NextResponse.json({ error: "Parent session required." }, { status: 401 });
  try {
    const records = await prisma.attendance.findMany({ where: { studentId: enrollmentId }, orderBy: { date: "desc" }, take: 120 });
    const present = records.filter(item => item.status === "PRESENT" || item.status === "LATE").length;
    return NextResponse.json({
      summary: {
        total: records.length,
        present,
        absent: records.filter(item => item.status === "ABSENT").length,
        late: records.filter(item => item.status === "LATE").length,
        excused: records.filter(item => item.status === "EXCUSED").length,
        rate: records.length ? Math.round((present / records.length) * 100) : null,
      },
      records: records.map(item => ({ id: item.id, date: item.date, status: item.status, remarks: item.remarks })),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to load attendance detail." }, { status: 500 });
  }
}
