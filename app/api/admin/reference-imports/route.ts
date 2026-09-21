import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getCurrentUser, roleAllowed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

const roles = ["SUPER_ADMIN", "ADMIN"] as const;
const bodySchema = z.object({
  source: z.enum(["enrollment", "staff"]),
  rows: z.array(z.record(z.string(), z.string())).max(5000),
});
const clean = (value: string | undefined) => (value || "").trim();
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const SOURCE_SHEET = "G.R";

type PreparedEnrollmentRow = {
  rowNumber: number;
  grNumber: string;
  studentName: string;
  guardianName: string;
  guardianPhone: string;
  dateOfBirth: string | null;
  gender: "MALE" | "FEMALE" | null;
  className: string;
  shift: string;
  section: string | null;
  gradeId: string | null;
  gradeName: string | null;
  gradeCode: string | null;
  enrollmentStatus: "ENROLLED" | "LEFT" | "EXPELLED";
  statusSource: string;
  valid: boolean;
  validationErrors: string[];
  source: Record<string, unknown>;
};

function romanToNumber(value: string) {
  const map: Record<string, number> = { I: 1, V: 5, X: 10 };
  let total = 0;
  let previous = 0;
  for (const char of value.split("").reverse()) {
    const current = map[char] || 0;
    total += current < previous ? -current : current;
    previous = current;
  }
  return total || null;
}

function resolveGrade(className: string) {
  const raw = className.trim();
  const key = normalize(raw);
  if (!key || key === "newadmission" || key === "unplaced") {
    return { gradeName: null, gradeCode: null, section: null };
  }

  const aliases: Record<string, { gradeName: string; gradeCode: string }> = {
    nursery: { gradeName: "Nursery", gradeCode: "NURSERY" },
    kg: { gradeName: "KG", gradeCode: "KG" },
    kg1: { gradeName: "KG1", gradeCode: "KG1" },
    kindergarten: { gradeName: "Kindergarten", gradeCode: "KINDERGARTEN" },
    aghaaz: { gradeName: "Aghaaz", gradeCode: "AGHAAZ" },
    aghaazjunior: { gradeName: "Aghaaz Junior", gradeCode: "AGHAAZ-JUNIOR" },
    aghaazsenior: { gradeName: "Aghaaz Senior", gradeCode: "AGHAAZ-SENIOR" },
    s1: { gradeName: "S1", gradeCode: "S1" },
    girlliteracy: { gradeName: "Girl Literacy", gradeCode: "GIRL-LITERACY" },
    primarya: { gradeName: "Primary A", gradeCode: "PRIMARY-A" },
    primaryb: { gradeName: "Primary B", gradeCode: "PRIMARY-B" },
  };
  if (aliases[key]) return { ...aliases[key], section: null };

  const aghaazSectionMatch = raw.match(/^aghaaz\s+(junior|senior)\s*([ab])$/i);
  if (aghaazSectionMatch) {
    const gradeName = `Aghaaz ${aghaazSectionMatch[1].replace(/^\w/, char => char.toUpperCase())}`;
    return { gradeName, gradeCode: gradeName.toUpperCase().replace(/[^A-Z0-9]+/g, "-"), section: aghaazSectionMatch[2].toUpperCase() };
  }

  const sectionMatch = raw.match(/^class\s*(i{1,3}|iv|v|vi|[1-9])\s*([ab])$/i);
  if (sectionMatch) {
    const token = sectionMatch[1];
    const number = /^\d+$/.test(token) ? Number(token) : romanToNumber(token.toUpperCase());
    if (number) {
      return { gradeName: `Class ${number}`, gradeCode: `CLASS-${number}`, section: sectionMatch[2].toUpperCase() };
    }
  }

  const romanMatch = raw.match(/^class\s*(i{1,6}|v|x)$/i);
  if (romanMatch) {
    const number = romanToNumber(romanMatch[1].toUpperCase());
    if (number) return { gradeName: `Class ${number}`, gradeCode: `CLASS-${number}`, section: null };
  }

  const numericMatch = raw.match(/^class\s*([0-9]+)$/i);
  if (numericMatch) {
    const number = Number(numericMatch[1]);
    return { gradeName: `Class ${number}`, gradeCode: `CLASS-${number}`, section: null };
  }

  if (/^\d+$/.test(raw)) {
    return { gradeName: `Class ${Number(raw)}`, gradeCode: `CLASS-${Number(raw)}`, section: null };
  }

  return {
    gradeName: raw.replace(/\s+/g, " ").replace(/\b\w/g, char => char.toUpperCase()),
    gradeCode: raw.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, ""),
    section: null,
  };
}

function excelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0));
    }
  }
  const text = String(value ?? "").trim();
  if (!text || ["-", "N/A", "NA", "NULL"].includes(text.toUpperCase())) return null;

  const dmy = text.match(/^(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) return candidate;
    return null;
  }

  const ymd = text.match(/^(\\d{4})[\\/.-](\\d{1,2})[\\/.-](\\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) return candidate;
    return null;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const HEADER_ALIASES: Record<string, string[]> = {
  gr: ["gr", "grnumber", "grno", "generalregister", "generalregisternumber", "registrationnumber"],
  name: ["name", "studentname", "nameofstudent", "student"],
  guardianName: ["fathername", "fathersname", "father", "guardianname", "parentname", "guardian"],
  guardianPhone: ["cellno", "cellnumber", "cell", "mobile", "mobilenumber", "phone", "phonenumber", "guardianphone", "contactno"],
  dateOfBirth: ["dob", "dateofbirth", "birthdate", "dateofbirthstudent"],
  gender: ["g", "gender", "sex"],
  className: ["class", "classname", "grade", "currentclass", "currentgrade"],
  originalClassName: ["originalclass", "previousclass", "classatentry"],
  shift: ["shift", "timing"],
  status: ["status", "enrollmentstatus", "studentstatus", "currentstatus"],
};

function canonicalHeader(value: unknown) {
  return normalize(String(value ?? ""));
}

function canonicalizeEnrollmentRows(rows: Record<string, unknown>[]) {
  return rows.map(row => {
    const byCanonical: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(row)) {
      if (header.startsWith("__")) continue;
      const key = canonicalHeader(header);
      if (!key) continue;
      for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.includes(key)) {
          const existing = byCanonical[canonical];
          if (existing === undefined || String(existing ?? "").trim() === "") byCanonical[canonical] = value;
          break;
        }
      }
    }
    return { ...row, ...byCanonical };
  });
}

function normalizeEnrollmentStatus(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\\s+/g, " ");
  if (["enrolled", "enrol", "active", "current", "currently enrolled", "admitted"].includes(raw)) {
    return { status: "ENROLLED" as const, source: raw };
  }
  if (["left", "leaving", "withdrawn", "withdraw", "transferred", "transfer", "inactive", "left school"].includes(raw)) {
    return { status: "LEFT" as const, source: raw };
  }
  if (["expelled", "expel", "dismissed", "removed"].includes(raw)) {
    return { status: "EXPELLED" as const, source: raw };
  }
  return { status: null, source: raw };
}

function extractSessionCandidates(text: string) {
  const matches = [...text.matchAll(/(20\d{2})\s*[-–—\/]\s*(20\d{2})/g)]
    .map(match => `${match[1]}-${match[2]}`);
  return [...new Set(matches)];
}

function detectSessionName(fileName: string, workbook: XLSX.WorkBook) {
  const candidates = new Set<string>(extractSessionCandidates(fileName));
  for (const value of Object.values(workbook.Props || {})) {
    if (typeof value === "string") {
      for (const candidate of extractSessionCandidates(value)) candidates.add(candidate);
    }
  }
  for (const sheetName of workbook.SheetNames) {
    for (const candidate of extractSessionCandidates(sheetName)) candidates.add(candidate);
  }
  for (const sheetName of workbook.SheetNames.slice(0, 8)) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false }).slice(0, 20);
    for (const row of rows) {
      for (const value of row) {
        if (typeof value !== "string") continue;
        for (const candidate of extractSessionCandidates(value)) candidates.add(candidate);
      }
    }
  }
  if (candidates.size !== 1) {
    throw new Error(
      candidates.size > 1
        ? `Multiple academic sessions were detected (${[...candidates].join(", ")}). Upload one session per workbook.`
        : "Academic session could not be detected. Include the session in the workbook filename, sheet name, workbook metadata, or the first rows (for example 2018-2019)."
    );
  }
  return [...candidates][0];
}

function sessionDates(name: string) {
  const match = name.match(/^(20\d{2})-(20\d{2})$/);
  if (!match) throw new Error("Detected academic session has an invalid format.");
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  if (endYear !== startYear + 1) throw new Error("Academic session must span consecutive years.");
  return {
    startDate: new Date(`${startYear}-09-01T00:00:00.000Z`),
    endDate: new Date(`${endYear}-08-31T23:59:59.999Z`),
  };
}

async function findSession(sessionName: string) {
  return prisma.academicSession.findUnique({ where: { name: sessionName } });
}

function parseEnrollmentWorkbook(buffer: ArrayBuffer, fileName: string): { sessionName: string; sourceSheet: string; rows: Record<string, unknown>[] } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sessionName = detectSessionName(fileName, workbook);
  const preferredSheet = workbook.SheetNames.find(name => canonicalHeader(name) === canonicalHeader(SOURCE_SHEET));
  const generalRegisterSheet = workbook.SheetNames.find(name => ["gr", "generalregister", "generalregistersheet"].includes(canonicalHeader(name)));
  const sheetName = preferredSheet || generalRegisterSheet || (workbook.SheetNames.length === 1 ? workbook.SheetNames[0] : null);
  if (!sheetName) throw new Error(`The workbook must contain a G.R / General Register sheet. Available sheets: ${workbook.SheetNames.join(", ")}`);
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true })
    .map((row, index) => ({ ...row, __rowNumber: index + 2 }));
  return {
    sessionName,
    sourceSheet: sheetName,
    rows: canonicalizeEnrollmentRows(rawRows),
  };
}

async function getEnrollmentContext(sessionName: string) {
  const session = await findSession(sessionName);
  const grades = await prisma.academicGrade.findMany({
    where: { sessionId: session?.id || "__missing_session__" },
    select: { id: true, name: true, code: true, active: true },
    orderBy: { displayOrder: "asc" },
  });
  return { session, grades };
}

function prepareEnrollmentRows(
  rows: Record<string, unknown>[],
  grades: { id: string; name: string; code: string; active: boolean }[],
): PreparedEnrollmentRow[] {
  const seen = new Set<string>();
  return rows.map(row => {
    const grNumber = String(row.gr ?? "").trim();
    const studentName = String(row.name ?? "").trim();
    const guardianName = String(row.guardianName ?? "").trim();
    const statusResult = normalizeEnrollmentStatus(row.status);
    const validationErrors: string[] = [];
    if (!grNumber) validationErrors.push("GR is missing.");
    if (!studentName) validationErrors.push("Student name is missing.");
    if (!statusResult.status) validationErrors.push(`Unrecognized enrollment status: "${String(row.status ?? "").trim() || "blank"}".`);

    const duplicate = Boolean(grNumber && seen.has(grNumber));
    if (grNumber) seen.add(grNumber);
    if (duplicate) validationErrors.push(`Duplicate GR ${grNumber} in this workbook.`);

    const originalClassName = String(row.className ?? "").trim();
    const currentClassName = String(row.originalClassName ?? "").trim();
    const className = (!originalClassName || normalize(originalClassName) === "newadmission" || normalize(originalClassName) === "unplaced")
      ? (currentClassName || originalClassName || "Unplaced")
      : originalClassName;
    const resolved = resolveGrade(className);
    const grade = resolved.gradeCode
      ? grades.find(item => item.active && (item.code === resolved.gradeCode || normalize(item.name) === normalize(resolved.gradeName || ""))) || null
      : null;
    const dob = excelDate(row.dateOfBirth);
    const gender = String(row.gender ?? "").trim().toLowerCase();
    if (row.dateOfBirth && !dob) validationErrors.push("Date of birth could not be interpreted safely.");
    return {
      rowNumber: Number(row.__rowNumber || 0),
      grNumber,
      studentName,
      guardianName,
      guardianPhone: String(row.guardianPhone ?? "").trim(),
      dateOfBirth: dob?.toISOString() || null,
      gender: gender === "m" || gender === "male" ? "MALE" : gender === "f" || gender === "female" ? "FEMALE" : null,
      className,
      section: resolved.section,
      shift: String(row.shift ?? "").trim(),
      gradeId: grade?.id || null,
      gradeName: grade?.name || resolved.gradeName,
      gradeCode: grade?.code || resolved.gradeCode,
      enrollmentStatus: statusResult.status || "LEFT",
      statusSource: statusResult.source,
      valid: validationErrors.length === 0,
      validationErrors,
      source: row,
    };
  });
}

async function existingRegistryBySession(sessionId: string, grNumbers: string[]) {
  if (!grNumbers.length) return [];
  return prisma.$queryRawUnsafe<{ grNumber: string }[]>(
    `SELECT sr."grNumber"
     FROM "StudentRegistry" sr
     JOIN "Enrollment" e ON e."id"=sr."enrollmentId"
     WHERE e."academicSessionId"=$1 AND sr."grNumber" = ANY($2::text[])`,
    sessionId,
    grNumbers,
  );
}

async function findIdentity(tx: Prisma.TransactionClient, row: PreparedEnrollmentRow) {
  const byGr = await tx.$queryRawUnsafe<{ studentIdentityId: string }[]>(
    `SELECT e."studentIdentityId"
     FROM "StudentRegistry" sr
     JOIN "Enrollment" e ON e."id"=sr."enrollmentId"
     WHERE sr."grNumber"=$1
     ORDER BY e."enrolledAt" DESC
     LIMIT 1`,
    row.grNumber,
  );
  if (byGr[0]?.studentIdentityId) return { id: byGr[0].studentIdentityId, source: "GR" as const };

  const byIdentity = await tx.$queryRawUnsafe<{ studentIdentityId: string }[]>(
    `SELECT DISTINCT e."studentIdentityId"
     FROM "Enrollment" e
     JOIN "Application" a ON a."id"=e."applicationId"
     WHERE lower(trim(a."studentName"))=lower(trim($1))
       AND trim(a."guardianPhone")=trim($2)
       AND a."dateOfBirth" IS NOT DISTINCT FROM $3::timestamp
     LIMIT 3`,
    row.studentName,
    row.guardianPhone,
    row.dateOfBirth ? new Date(row.dateOfBirth) : null,
  );
  if (byIdentity.length > 1) throw new Error(`AMBIGUOUS_STUDENT_IDENTITY:${row.rowNumber}`);
  if (byIdentity[0]?.studentIdentityId) return { id: byIdentity[0].studentIdentityId, source: "MATCH" as const };

  const identity = await tx.studentIdentity.create({ data: {} });
  return { id: identity.id, source: "NEW" as const };
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
      if (!(file instanceof File)) return NextResponse.json({ error: "Upload an enrollment workbook." }, { status: 400 });
      if (!file.name.toLowerCase().endsWith(".xlsx")) return NextResponse.json({ error: "Only .xlsx workbooks are supported." }, { status: 400 });
      if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Workbook is too large." }, { status: 400 });

      const parsedWorkbook = parseEnrollmentWorkbook(await file.arrayBuffer(), file.name);
      const { session, grades } = await getEnrollmentContext(parsedWorkbook.sessionName);
      const prepared = prepareEnrollmentRows(parsedWorkbook.rows, grades);
      const valid = prepared.filter(row => row.valid);
      const reviewRows = prepared.filter(row => !row.valid);
      const existing = session ? await existingRegistryBySession(session.id, valid.map(row => row.grNumber)) : [];
      const existingSet = new Set(existing.map(row => row.grNumber));
      const ready = valid.filter(row => !existingSet.has(row.grNumber));

      if (mode === "preview") {
        return NextResponse.json({
          source,
          sourceSheet: parsedWorkbook.sourceSheet,
          session: { id: session?.id || null, name: parsedWorkbook.sessionName, exists: Boolean(session) },
          totalSourceRows: prepared.length,
          eligibleRows: valid.length,
          readyToImport: ready.length,
          alreadyImported: existing.length,
          missingOrInvalidRows: reviewRows.length,
          statusCounts: {
            enrolled: prepared.filter(row => row.enrollmentStatus === "ENROLLED").length,
            left: prepared.filter(row => row.enrollmentStatus === "LEFT").length,
            expelled: prepared.filter(row => row.enrollmentStatus === "EXPELLED").length,
            needsReview: reviewRows.length,
          },
          reviewRows: reviewRows.slice(0, 100).map(row => ({
            rowNumber: row.rowNumber,
            grNumber: row.grNumber,
            studentName: row.studentName,
            sourceStatus: row.statusSource,
            errors: row.validationErrors,
          })),
          gradeCreationPlan: [...new Map(
            ready
              .filter(row => row.gradeCode && !row.gradeId)
              .map(row => [row.gradeCode, { name: row.gradeName, code: row.gradeCode }])
          ).values()],
          unmappedClasses: [...new Set(
            ready.filter(row => !row.gradeCode).map(row => row.className)
          )],
          readyGrNumbers: ready.map(row => row.grNumber),
          sample: ready.slice(0, 25).map(row => ({
            rowNumber: row.rowNumber,
            grNumber: row.grNumber,
            studentName: row.studentName,
            guardianName: row.guardianName,
            className: row.className,
            gradeName: row.gradeName,
            shift: row.shift,
            status: row.enrollmentStatus,
          })),
        });
      }

      if (mode !== "import") return NextResponse.json({ error: "Mode must be preview or import." }, { status: 400 });
      const requestedGrNumbers = JSON.parse(clean(String(form.get("grNumbers") || "[]"))) as string[];
      const requested = new Set(requestedGrNumbers);
      const candidates = ready.filter(row => requested.has(row.grNumber)).slice(0, 50);
      if (!candidates.length) return NextResponse.json({ imported: 0, skipped: requested.size, remaining: 0 });

      const context = requestAuditContext(request);
      let imported = 0;
      try {
        await prisma.$transaction(async tx => {
          const targetSession = session ?? await tx.academicSession.create({
            data: { name: parsedWorkbook.sessionName, ...sessionDates(parsedWorkbook.sessionName) },
          });

          const gradeCache = new Map<string, string>();
          const existingGrades = await tx.academicGrade.findMany({
            where: { sessionId: targetSession.id, active: true },
            select: { id: true, code: true },
          });
          for (const grade of existingGrades) gradeCache.set(grade.code, grade.id);

          let nextDisplayOrder = existingGrades.length;
          for (const row of candidates) {
            if (row.gradeCode && !gradeCache.has(row.gradeCode)) {
              const grade = await tx.academicGrade.create({
                data: {
                  sessionId: targetSession.id,
                  name: row.gradeName || row.className,
                  code: row.gradeCode,
                  displayOrder: nextDisplayOrder++,
                  active: true,
                },
                select: { id: true, code: true },
              });
              gradeCache.set(grade.code, grade.id);
            }
            if (row.gradeCode) row.gradeId = gradeCache.get(row.gradeCode) || row.gradeId;
          }

          for (const row of candidates) {
            const existingForSession = await tx.$queryRawUnsafe<{ enrollmentId: string }[]>(
              `SELECT e."id" AS "enrollmentId"
               FROM "StudentRegistry" sr
               JOIN "Enrollment" e ON e."id"=sr."enrollmentId"
               WHERE e."academicSessionId"=$1 AND sr."grNumber"=$2
               LIMIT 1`,
              targetSession.id,
              row.grNumber,
            );
            if (existingForSession[0]) continue;
            const identity = await findIdentity(tx, row);
            const numbers = await tx.$queryRawUnsafe<{ applicationNumber: string; admissionNumber: string }[]>(
              `SELECT 'REG-' || LPAD(nextval('"application_number_seq"')::text, 5, '0') AS "applicationNumber",
                      'ADM-' || LPAD(nextval('"admission_number_seq"')::text, 5, '0') AS "admissionNumber"`
            );
            const numberSet = numbers[0];
            if (!numberSet) throw new Error("NUMBER_ALLOCATION_FAILED");

            const application = await tx.application.create({
              data: {
                applicationNumber: numberSet.applicationNumber,
                sessionId: targetSession.id,
                desiredClass: row.className,
                studentName: row.studentName,
                dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : null,
                gender: row.gender as "MALE" | "FEMALE" | undefined,
                guardianName: row.guardianName,
                guardianPhone: row.guardianPhone,
                remarks: `Imported reference data from ${file.name}; source session ${parsedWorkbook.sessionName}`,
                formData: JSON.parse(JSON.stringify({
                  source: file.name,
                  sheet: parsedWorkbook.sourceSheet,
                  rowNumber: row.rowNumber,
                  shift: row.shift,
                  legacy: row.source,
                })),
                status: "ENROLLED",
              },
            });

            const enrollment = await tx.enrollment.create({
              data: {
                applicationId: application.id,
                studentId: `STU-${randomUUID().slice(0, 8).toUpperCase()}`,
                studentIdentityId: identity.id,
                admissionNumber: numberSet.admissionNumber,
                className: row.className,
                section: row.section,
                academicSessionId: targetSession.id,
                academicGradeId: row.gradeId,
                academicSectionId: null,
                enrolledAt: new Date(),
                status: row.enrollmentStatus,
              },
            });

            await tx.$executeRaw`INSERT INTO "StudentRegistry" ("id","enrollmentId","grNumber") VALUES (${randomUUID()},${enrollment.id},${row.grNumber})`;

              await tx.enrollmentHistory.create({
              data: {
                enrollmentId: enrollment.id,
                action: "IMPORTED_REFERENCE_DATA",
                academicSessionId: targetSession.id,
                academicSessionName: targetSession.name,
                academicGradeId: row.gradeId,
                academicGradeName: row.gradeName || row.className,
                className: row.className,
                section: row.section,
                status: row.enrollmentStatus,
                note: `Imported from ${file.name}, ${parsedWorkbook.sourceSheet} row ${row.rowNumber}; source status: ${row.statusSource || "blank"}; shift: ${row.shift || "not recorded"}`,
                createdBy: user.id,
              },
            });
            imported += 1;
          }
        }, {
          maxWait: 10000,
          timeout: 120000,
        });
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("AMBIGUOUS_STUDENT_IDENTITY:")) {
          return NextResponse.json({
            error: `Student identity is ambiguous for source row ${error.message.split(":")[1]}. The row was not imported; resolve the matching student before retrying.`,
          }, { status: 409 });
        }
        throw error;
      }

      const remaining = ready.length - imported;
      await writeAuditLog({
        userId: user.id,
        action: "HISTORICAL_ENROLLMENT_IMPORT",
        entityType: "AcademicSession",
        entityId: session?.id || "created-during-import",
        metadata: {
          sessionName: parsedWorkbook.sessionName,
          sourceFile: file.name,
          sourceSheet: parsedWorkbook.sourceSheet,
          imported,
          remaining,
        },
        context,
      });
      return NextResponse.json({
        imported,
        remaining,
        session: { id: session?.id || null, name: parsedWorkbook.sessionName },
      });
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
    return NextResponse.json({
      source,
      totalRows: rows.length,
      validRows: rows.length - invalidRows,
      invalidRows,
      errors: errors.slice(0, 100),
      written: false,
      message: "Validation only. No production records were created or modified.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process reference import.";
    if (message === "AUTHENTICATION_REQUIRED") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    if (message === "ADMIN_REQUIRED") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    console.error(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
