import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const configuration = [
  { term: "FIRST", subjects: [
    ["English", 100], ["Science", 100], ["Social Studies", 100], ["Mathematics", 100], ["Urdu", 100], ["Islamiat", 100],
  ] },
  { term: "SECOND", subjects: [
    ["English", 100], ["Science", 100], ["Social Studies", 100], ["English Reading", 50], ["Urdu Reading", 50], ["Mathematics", 100], ["Urdu", 50], ["Islamiat", 50],
  ] },
  { term: "THIRD", subjects: [
    ["English", 100], ["Science", 100], ["Social Studies", 100], ["English Reading", 50], ["Urdu Reading", 50], ["Mathematics", 100], ["Urdu", 50], ["Islamiat", 50],
  ] },
];

const session = await prisma.academicSession.findFirst({
  where: { name: { contains: "2025" } },
  orderBy: { startDate: "desc" },
});

if (!session || !session.name.includes("2026")) {
  throw new Error("Academic session containing both 2025 and 2026 was not found. Create the 2025-26 session first.");
}

let created = 0;
let updated = 0;

for (const term of configuration) {
  const total = term.subjects.reduce((sum, [, maxMarks]) => sum + maxMarks, 0);
  if (total !== 600) throw new Error(`${term.term} configuration must total 600; got ${total}`);

  for (const [index, [subject, maxMarks]] of term.subjects.entries()) {
    const existing = await prisma.reportCardSubject.findFirst({
      where: { sessionId: session.id, className: "IB", section: null, term: term.term, subject },
      select: { id: true },
    });

    if (existing) {
      await prisma.reportCardSubject.update({
        where: { id: existing.id },
        data: { maxMarks, displayOrder: index, active: true },
      });
      updated += 1;
    } else {
      await prisma.reportCardSubject.create({
        data: { sessionId: session.id, className: "IB", section: null, term: term.term, subject, maxMarks, displayOrder: index, active: true },
      });
      created += 1;
    }
  }
}

console.log(`Seeded Aghaaz Class IB 2025-26 report-card configuration for session '${session.name}': ${created} created, ${updated} updated.`);
console.log("Assessment components were intentionally not seeded because the audited workbook contains component/header inconsistencies that require explicit school confirmation.");

await prisma.$disconnect();
