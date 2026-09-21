import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

const roles = ["SUPER_ADMIN", "ADMIN"] as const;
const bodySchema = z.object({ source: z.enum(["enrollment", "staff"]), rows: z.array(z.record(z.string(), z.string())).max(5000) });
const clean = (value: string | undefined) => (value || "").trim();
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const SOURCE_SHEET = "G.R";
const SESSION_NAME = "2026-2027";

function excelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "N/A") return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseEnrollmentWorkbook(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[SOURCE_SHEET];
  if (!sheet) throw new Error(\`The workbook must contain a "\${SOURCE_SHEET}" sheet.\`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true }).map((row, index) => ({ ...row, __rowNumber: index + 2 }));
}

async function getEnrollmentContext() {
  const session = await prisma.academicSession.findUnique({ where: { name: SESSION_NAME } });
  if (!session) throw new Error(\`Academic session \${SESSION_NAME} is not configured.\`);
  const grades = await prisma.academicGrade.findMany({
    where: { sessionId: session.id },
    select: { id: true, name: true, code: true, active: true },
    orderBy: { displayOrder: "asc" },
  });
  return { session, grades };
}

function prepareEnrollmentRows(rows: Record<string, unknown>[], grades: { id: string; name: string; code: string; active: boolean }[]) {
  const enrolled = rows.filter(row => String(row.Status ?? "").trim().toLowerCase() === "enrolled");
  const seen = new Set<string>();
  return enrolled.map(row => {
    const grNumber = String(row.GR ?? "").trim();
    const duplicate = !grNumber || seen.has(grNumber);
    if (grNumber) seen.add(grNumber);
    const className = String(row.Class ?? row["current Class"] ?? "").trim() || "Unplaced";
    const gradeKey = normalize(className);
    const grade = grades.find(item => item.active && (normalize(item.name) === gradeKey || normalize(item.code) === gradeKey)) || null;
    const dob = excelDate(row["D.O.B"]);
    const gender = String(row.G ?? "").trim().toLowerCase();
    return {
      rowNumber: Number(row.__rowNumber || 0),
      grNumber,
      studentName: String(row.Name ?? "").trim(),
      guardianName: String(row["Father Name"] ?? "").trim(),
      guardianPhone: String(row["Cell no."] ?? "").trim(),
      dateOfBirth: dob?.toISOString() || null,
      gender: gender === "m" ? "MALE" : gender === "f" ? "FEMALE" : null,
      className,
      shift: String(row.Shift ?? "").trim(),
      gradeId: grade?.id || null,
      gradeName: grade?.name || null,
      valid: Boolean(grNumber && String(row.Name ?? "").trim() && String(row["Father Name"] ?? "").trim() && !duplicate),
      source: row,
    };
  });
}

async function authorize(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");
  if (!roleAllowed(user.role, [...roles])) throw new Error("ADMIN_REQUIRED");
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await authorize(request);
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const mode = clean(String(form.get("mode") || "preview"));
      const source = clean(String(form.get("source") || "enrollment"));
      if (source !== "enrollment") return NextResponse.json({ error: "Excel import currently supports the enrollment workbook." }, { status: 400 });
      if (!(file instanceof File)) return NextResponse.json({ error: "Upload the 2026-2027 enrollment workbook." }, { status: 400 });
      if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Only .xlsx workbooks are supported." }, { status: 400 });
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Workbook is too large." }, { status: 400 });

      const { session, grades } = await getEnrollmentContext();
      const prepared = prepareEnrollmentRows(parseEnrollmentWorkbook(await file.arrayBuffer()), grades);
      const valid = prepared.filter(row => row.valid);
      const existing = valid.length ? await prisma.studentRegistry.findMany({
        where: { grNumber: { in: valid.map(row => row.grNumber) } },
        select: { grNumber: true },
      }) : [];
      const existingSet = new Set(existing.map(row => row.grNumber));
      const ready = valid.filter(row => !existingSet.has(row.grNumber));

      if (mode === "preview") {
        return NextResponse.json({
          source, sourceSheet: SOURCE_SHEET, session: { id: session.id, name: session.name },
          totalSourceRows: prepared.length, eligibleRows: valid.length, readyToImport: ready.length,
          alreadyImported: existing.length, missingOrInvalidRows: prepared.length - valid.length,
          unmatchedClasses: [...new Set(ready.filter(row => !row.gradeId).map(row => row.className))],
          readyGrNumbers: ready.map(row => row.grNumber),
          sample: ready.slice(0, 25).map(row => ({
            rowNumber: row.rowNumber, grNumber: row.grNumber, studentName: row.studentName,
            guardianName: row.guardianName, className: row.className, gradeName: row.gradeName, shift: row.shift,
          })),
        });
      }

      if (mode !== "import") return NextResponse.json({ error: "Mode must be preview or import." }, { status: 400 });
      const requestedGrNumbers = JSON.parse(clean(String(form.get("grNumbers") || "[]"))) as string[];
      const requested = new Set(requestedGrNumbers);
      const candidates = ready.filter(row => requested.has(row.grNumber)).slice(0, 50);
      if (!candidates.length) return NextResponse.json({ imported: 0, skipped: requested.size, remaining: 0 });

      const context = requestAuditContext(request);
      await prisma.$transaction(async tx => {
        for (const row of candidates) {
          const application = await tx.application.create({
            data: {
              id: randomUUID(),
              applicationNumber: \`HIST-2627-\${row.grNumber}\`,
              sessionId: session.id,
              desiredClass: row.className,
              studentName: row.studentName,
              dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
              gender: row.gender as "MALE" | "FEMALE" | undefined,
              guardianName: row.guardianName,
              guardianPhone: row.guardianPhone,
              remarks: "Imported from Session 2026-2027 enrollements.xlsx",
              formData: JSON.parse(JSON.stringify({ source: "2026-2027 enrollment workbook", sheet: SOURCE_SHEET, rowNumber: row.rowNumber, shift: row.shift, legacy: row.source })),
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
        }
      });

      const remaining = ready.length - candidates.length;
      await writeAuditLog({
        userId: user.id, action: "HISTORICAL_ENROLLMENT_IMPORT", entityType: "AcademicSession", entityId: session.id,
        metadata: { sessionName: session.name, sourceSheet: SOURCE_SHEET, imported: candidates.length, remaining },
        context,
      });
      return NextResponse.json({ imported: candidates.length, remaining, session: { id: session.id, name: session.name } });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid staged import payload." }, { status: 400 });
    const { source, rows } = parsed.data;
    const errors: Array<{ row: number; error: string }> = [];

    if (source === "staff") {
      rows.forEach((row, index) => {
        if (clean(row["Employee Name"]).length < 2) errors.push({ row: index + 2, error: "Employee Name is required." });
        if (clean(row.Designation).length < 2) errors.push({ row: index + 2, error: "Designation is required." });
        const salary = clean(row["Monthly Salary"]);
        if (salary && Number.isNaN(Number(salary.replace(/,/g, "")))) errors.push({ row: index + 2, error: "Monthly Salary must be numeric." });
      });
    } else {
      rows.forEach((row, index) => {
        if (clean(row.GR).length < 2) errors.push({ row: index + 2, error: "GR is required." });
        if (clean(row.Name).length < 2) errors.push({ row: index + 2, error: "Name is required." });
        if (clean(row["D.O.B"]) && Number.isNaN(Date.parse(clean(row["D.O.B"])))) errors.push({ row: index + 2, error: "D.O.B is not a recognized date." });
      });
    }

    const invalidRows = new Set(errors.map(item => item.row)).size;
    return NextResponse.json({ source, totalRows: rows.length, validRows: rows.length - invalidRows, invalidRows, errors: errors.slice(0, 100), written: false, message: "Validation only. No production records were created or modified." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process reference import.";
    if (message === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (message === "ADMIN_REQUIRED") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
