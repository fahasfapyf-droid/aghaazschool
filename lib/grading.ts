import { prisma } from "@/lib/prisma";

export type GradingBand = { label: string; minPercentage: number; maxPercentage: number; displayOrder: number };

export async function getGradingBands(sessionId: string): Promise<GradingBand[]> {
  const schemes = await prisma.$queryRawUnsafe<Array<{ id: string; sessionId: string | null }>>(
    `SELECT "id","sessionId" FROM "GradingScheme" WHERE "active"=true AND ("sessionId"=$1 OR "sessionId" IS NULL) ORDER BY CASE WHEN "sessionId"=$1 THEN 0 ELSE 1 END,"createdAt" ASC LIMIT 1`,
    sessionId
  );
  if (!schemes[0]) return [];
  const bands = await prisma.$queryRawUnsafe<Array<{ label: string; minPercentage: unknown; maxPercentage: unknown; displayOrder: number }>>(
    `SELECT "label","minPercentage","maxPercentage","displayOrder" FROM "GradingBand" WHERE "schemeId"=$1 ORDER BY "minPercentage" DESC,"displayOrder" ASC`,
    schemes[0].id
  );
  return bands.map(band => ({ label: band.label, minPercentage: Number(band.minPercentage), maxPercentage: Number(band.maxPercentage), displayOrder: Number(band.displayOrder) }));
}

export function resolveGrade(bands: GradingBand[], percentage: number): string | null {
  if (!Number.isFinite(percentage) || percentage < 0) return null;
  return bands.find(band => percentage >= band.minPercentage && percentage <= band.maxPercentage)?.label || null;
}

export async function getConfiguredGrade(sessionId: string, percentage: number): Promise<string | null> {
  const bands = await getGradingBands(sessionId);
  return resolveGrade(bands, percentage);
}
