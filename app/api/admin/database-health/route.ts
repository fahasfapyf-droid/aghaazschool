import { NextResponse } from "next/server";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const requiredTables = [
  "User",
  "Application",
  "AdmissionEnquiry",
  "Enrollment",
  "AcademicSession",
  "StudentRegistry",
  "FamilyAccount",
  "FamilyAccountStudent",
];

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, ["SUPER_ADMIN", "ADMIN"])) {
      return NextResponse.json({ error: "You do not have permission to inspect database health." }, { status: 403 });
    }

    const database = await prisma.$queryRawUnsafe<{ database: string }[]>(
      "SELECT current_database() AS database",
    );

    const tables = await prisma.$queryRawUnsafe<{ tableName: string }[]>(
      `SELECT table_name AS "tableName"
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      requiredTables,
    );

    const migrations = await prisma.$queryRawUnsafe<{ migrationName: string; finishedAt: Date | null }[]>(
      `SELECT migration_name AS "migrationName", finished_at AS "finishedAt"
       FROM "_prisma_migrations"
       WHERE finished_at IS NOT NULL
       ORDER BY finished_at DESC
       LIMIT 15`,
    );

    const present = new Set(tables.map((row) => row.tableName));
    const missingTables = requiredTables.filter((table) => !present.has(table));

    return NextResponse.json({
      ok: missingTables.length === 0,
      database: database[0]?.database ?? null,
      missingTables,
      presentTables: tables.map((row) => row.tableName),
      recentMigrations: migrations,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Database health check failed.",
    }, { status: 500 });
  }
}
