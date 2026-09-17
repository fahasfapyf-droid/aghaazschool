import { prisma } from "@/lib/prisma";

type GradingBand = { label: string; minPercentage: number; maxPercentage: number; displayOrder: number };

export async function getConfiguredGrade(sessionId: string, percentage: number): Promise<string | null> {
  if (!Number.isFinite(percentage) || percentage <= 0) return null;
  const schemes = await prisma.$queryRawUnsafe<Array<{ id: string; sessionId: string | null }>>(
    `SELECT "id","sessionId" FROM "GradingScheme" WHERE "active"=true AND ("sessionId"=$1 OR "sessionId" IS NULL) ORDER BY CASE WHEN "sessionId"=$1 THEN 0 ELSE 1 END,"createdAt" ASC LIMIT 1`,
    sessionId
  );
  if (!schemes[0]) return null;
  const bands = await prisma.$queryRawUnsafe<GradingBand[]>(
    `SELECT "label","minPercentage","maxPercentage","displayOrder" FROM "GradingBand" WHERE "schemeId"=$1 ORDER BY "minPercentage" DESC,"displayOrder" ASC`,
    schemes[0].id
  );
  const band = bands.find(item => percentage >= Number(item.minPercentage) && percentage <= Number(item.maxPercentage));
  return band?.label || null;
}
