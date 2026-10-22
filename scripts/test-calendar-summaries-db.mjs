// Run against an application using the same disposable, migrated DATABASE_URL.
import assert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const token = randomUUID();
const userId = `calendar-smoke-${token}`;
const username = `calendar-smoke-${token}`;
const password = randomBytes(24).toString("base64url");
const salt = randomBytes(16).toString("base64url");
const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("base64url")}`;
const startOfDay = new Date();
startOfDay.setHours(0, 0, 0, 0);
const events = [
  ...Array.from({ length: 7 }, (_, index) => ({ offset: index * 12 * 3600000, status: "PUBLISHED" })),
  { offset: -1, status: "PUBLISHED" },
  { offset: 7 * 86400000, status: "PUBLISHED" },
  { offset: 1, status: "DRAFT" },
  { offset: 2, status: "CANCELLED" },
].map((event, index) => ({
  ...event,
  id: `calendar-smoke-${token}-${index}`,
  startDate: new Date(startOfDay.getTime() + event.offset),
  endDate: new Date(startOfDay.getTime() + event.offset + 3600000),
}));

async function waitForApp() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // The CI application may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Application did not become ready for calendar summary tests.");
}

function verifyEvents(actual, limit, withEndDate) {
  assert.deepEqual(actual.map(event => event.id), events.slice(0, limit).map(event => event.id), "Only published events in the next seven days should appear, in date order and within the result limit");
  for (const [index, event] of actual.entries()) {
    assert.equal(event.startAt, events[index].startDate.toISOString(), "The startAt response field must come from the calendar startDate");
    if (withEndDate) assert.equal(event.endAt, events[index].endDate.toISOString());
  }
}

async function main() {
  await waitForApp();
  try {
    await prisma.user.create({ data: { id: userId, name: "Calendar smoke administrator", username, passwordHash, role: "ADMIN" } });
    // Insert out of date order to exercise the query's ORDER BY.
    for (const event of [...events].reverse()) {
      await prisma.$executeRawUnsafe(`INSERT INTO "SchoolEvent" ("id","title","eventType","startDate","endDate","status") VALUES ($1,$2,'GENERAL',$3,$4,$5)`, event.id, event.id, event.startDate, event.endDate, event.status);
    }
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: username, password }),
    });
    assert.equal(login.status, 200, "Test administrator must be able to log in");
    const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie, "Login must issue a session cookie");
    const headers = { Cookie: cookie };
    const dashboardResponse = await fetch(`${baseUrl}/api/dashboard`, { headers });
    assert.equal(dashboardResponse.status, 200);
    const dashboard = await dashboardResponse.json();
    verifyEvents(dashboard.dailyBrief.upcomingEvents, 6, true);
    console.log("PASS: dashboard returns published calendar events with correct dates, order, bounds and limit");

    // Session authentication exercises preview mode without delivering notifications.
    const briefResponse = await fetch(`${baseUrl}/api/reports/daily-brief`, { headers });
    assert.equal(briefResponse.status, 200);
    const brief = await briefResponse.json();
    assert.equal(brief.deliveredTo, 0);
    verifyEvents(brief.preview.upcomingEvents, 5, false);
    console.log("PASS: daily-brief preview returns published calendar events without delivering notifications");
  } finally {
    for (const event of events) await prisma.$executeRawUnsafe(`DELETE FROM "SchoolEvent" WHERE "id"=$1`, event.id);
    await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
