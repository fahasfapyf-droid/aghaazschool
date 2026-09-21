import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";
const roles = ["SUPER_ADMIN", "ADMIN"] as const;
const SOURCE_SHEET = "G.R";
const SOURCE_STATUS = "enrolled";
const SESSION_NAME = "2026-2027";

type SourceRow = Record<string, unknown> & { __rowNumber?: number };

function clean(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function excelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = clean(value);
  if (!text || text === "-" || text === "N/A") return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function parseWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[SOURCE_SHEET];
  if (!sheet) throw new Error(\`The workbook must contain a "\${SOURCE_SHEET}" sheet.\`);
  const rows = XLSX.utils.sheet_to_json<SourceRow>(sheet, { defval: null, raw: true });
  return rows.map((row, index) => ({ ...row, __rowNumber: index + 2 }));
}
async function loadContext() {
  const session = await prisma.academicSession.findUnique({ where: { name: SESSION_NAME } });
  if (!session) throw new Error(\`Academic session \${SESSION_NAME} is not configured.\`);
  const grades = await prisma.academicGrade.findMany({
    where: { sessionId: session.id },
    select: { id: true, name: true, code: true, active: true },
    orderBy: { displayOrder: "asc" },
  });
  return { session, grades };
}
function matchGrade(value: string, grades: { id: string; name: string; code: string; active: boolean }[]) {
  const key = normalize(value);
  if (!key) return null;
  return grades.find(grade => grade.active && (normalize(grade.name) === key || normalize(grade.code) === key)) || null;
}
function prepare(rows: SourceRow[], grades: { id: string; name: string; code: string; active: boolean }[]) {
  const enrolled = rows.filter(row => clean(row.Status).toLowerCase() === SOURCE_STATUS);
  const seen = new Set<string>();
  return enrolled.map(row => {
    const grNumber = clean(row.GR);
    const duplicate = !grNumber || seen.has(grNumber);
    if (grNumber) seen.add(grNumber);
    const className = clean(row.Class) || clean(row["current Class"]) || "Unplaced";
    const grade = matchGrade(className, grades);
    const dateOfBirth = excelDate(row["D.O.B"]);
    const gender = clean(row.G).toLowerCase();
    return {
      rowNumber: row.__rowNumber || 0, grNumber, studentName: clean(row.Name),
      guardianName: clean(row["Father Name"]), guardianPhone: clean(row["Cell no."]),
      dateOfBirth: dateOfBirth?.toISOString() || null,
      gender: gender === "m" ? "MALE" : gender === "f" ? "FEMALE" : null,
      className, shift: clean(row.Shift), gradeId: grade?.id || null, gradeName: grade?.name || null,
      duplicate, valid: Boolean(grNumber && clean(row.Name) && clean(row["Father Name"]) && !duplicate), source: row,
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (!roleAllowed(user.role, [...roles])) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file");
    const mode = clean(form.get("mode") || "preview");
    if (!(file instanceof File)) return NextResponse.json({ error: "Upload the 2026-2027 enrollment workbook." }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Only .xlsx workbooks are supported." }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Workbook is too large." }, { status: 400 });

    const { session, grades } = await loadContext();
    const prepared = prepare(parseWorkbook(await file.arrayBuffer()), grades);

    if (mode === "preview") {
      const valid = prepared.filter(row => row.valid);
      const existing = valid.length ? await prisma.studentRegistry.findMany({
        where: { grNumber: { in: valid.map(row => row.grNumber) } }, select: { grNumber: true },
      }) : [];
      const existingSet = new Set(existing.map(row => row.grNumber));
      const ready = valid.filter(row => !existingSet.has(row.grNumber));
      return NextResponse.json({
        session: { id: session.id, name: session.name }, sourceSheet: SOURCE_SHEET,
        totalSourceRows: prepared.length, eligibleRows: valid.length, readyToImport: ready.length,
        alreadyImported: existing.length, missingGrNumber: prepared.filter(row => !row.grNumber).length,
        invalidRows: prepared.filter(row => !row.valid).length,
        unmatchedClasses: [...new Set(valid.filter(row => !row.gradeId).map(row => row.className))],
        sample: ready.slice(0, 25).map(row => ({
          rowNumber: row.rowNumber, grNumber: row.grNumber, studentName: row.studentName,
          guardianName: row.guardianName, className: row.className, gradeName: row.gradeName, shift: row.shift,
        })),
      });
    }

    if (mode !== "import") return NextResponse.json({ error: "Mode must be preview or import." }, { status: 400 });

    const valid = prepared.filter(row => row.valid);
    const existing = valid.length ? await prisma.studentRegistry.findMany({
      where: { grNumber: { in: valid.map(row => row.grNumber) } }, select: { grNumber: true },
    }) : [];
    const existingSet = new Set(existing.map(row => row.grNumber));
    const candidates = valid.filter(row => !existingSet.has(row.grNumber));
    let imported = 0;
    const skipped = valid.length - candidates.length;
    const context = requestAuditContext(request);

    for (const row of candidates) {
      await prisma.$transaction(async tx => {
        const application = await tx.application.create({
          data: {
            id: randomUUID(), applicationNumber: \`HIST-2627-\${row.grNumber}\`, sessionId: session.id,
            desiredClass: row.className, studentName: row.studentName,
            dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
            gender: row.gender as "MALE" | "FEMALE" | undefined,
            guardianName: row.guardianName, guardianPhone: row.guardianPhone,
            remarks: "Imported from Session 2026-2027 enrollements.xlsx",
            formData: JSON.parse(JSON.stringify({
              source: "2026-2027 enrollment workbook", sheet: SOURCE_SHEET,
              rowNumber: row.rowNumber, shift: row.shift, legacy: row.source,
            })),
            status: "ENROLLED",
          },
        });
        const enrollment = await tx.enrollment.create({
          data: {
            id: randomUUID(), applicationId: application.id, studentId: application.id,
            admissionNumber: \`LEGACY-\${row.grNumber}\`, className: row.className, section: null,
            academicSessionId: session.id, academicGradeId: row.gradeId, academicSectionId: null,
            enrolledAt: new Date(), status: "ACTIVE",
          },
        });
        await tx.$executeRaw\`INSERT INTO "StudentRegistry" ("id","enrollmentId","grNumber") VALUES (\${randomUUID()},\${enrollment.id},\${row.grNumber})\`;
        await tx.enrollmentHistory.create({
          data: {
            enrollmentId: enrollment.id, action: "IMPORTED_REFERENCE_DATA",
            academicSessionId: session.id, academicSessionName: session.name,
            academicGradeId: row.gradeId, academicGradeName: row.gradeName || row.className,
            className: row.className, section: null, status: "ACTIVE",
            note: \`Imported from \${SOURCE_SHEET} row \${row.rowNumber}; shift: \${row.shift || "not recorded"}\`,
            createdBy: user.id,
          },
        });
      });
      imported += 1;
    }

    await writeAuditLog({
      userId: user.id, action: "HISTORICAL_ENROLLMENT_IMPORT", entityType: "AcademicSession",
      entityId: session.id, metadata: { sessionName: session.name, sourceSheet: SOURCE_SHEET, imported, skipped, eligible: valid.length },
      context,
    });
    return NextResponse.json({
      session: { id: session.id, name: session.name }, imported, skipped,
      unmatchedClasses: [...new Set(candidates.filter(row => !row.gradeId).map(row => row.className))],
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process historical enrollment workbook." }, { status: 500 });
  }
}
