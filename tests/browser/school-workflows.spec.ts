import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const year = new Date().getFullYear();
const sessionName = `Browser ${year}-${year + 1}`;
const studentName = "Browser Workflow Student";
const className = "Grade 1";

test.beforeAll(async () => {
  const session = await prisma.academicSession.create({ data: { name: sessionName, startDate: new Date(`${year}-01-01`), endDate: new Date(`${year + 1}-12-31`) } });
  const grade = await prisma.academicGrade.create({ data: { sessionId: session.id, name: className, code: "BROWSER-G1" } });
  await prisma.academicSection.create({ data: { gradeId: grade.id, name: "A", capacity: 10 } });
  for (const term of ["FIRST", "SECOND", "THIRD"] as const) await prisma.reportCardSubject.create({ data: { sessionId: session.id, className, term, subject: "English", maxMarks: 100 } });
});
test.afterAll(() => prisma.$disconnect());

test("admission, enrollment, attendance, fees, exams and immutable report cards", async ({ page }) => {
  await test.step("sign in through the browser", async () => {
    await page.goto("/login");
    await page.getByLabel("Username or phone").fill("browser-admin");
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("http://127.0.0.1:3100/");
  });

  let applicationId = "";
  let enrollmentId = "";
  await test.step("submit and approve an admission, collect the admission fee, and enroll", async () => {
    await page.goto("/admissions/new");
    await page.getByLabel(/Student name/).fill(studentName);
    await page.getByLabel("Phone number 1 *", { exact: true }).fill("99999999999");
    await page.getByLabel(/Emergency number/).fill("99999999998");
    await page.getByLabel(/Father \/ guardian name/).fill("Browser Guardian");
    await page.getByLabel(/Proposed \/ desired class/).fill(className);
    await page.getByLabel(/Academic session/).fill(sessionName);
    const created = page.waitForResponse(response => response.url().endsWith("/api/admissions") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit admission application", exact: true }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    applicationId = (await response.json()).id;
    await page.goto(`/admissions/${applicationId}`);
    await expect(page.getByRole("button", { name: "Save decision", exact: true })).toBeVisible();
    const decided = page.waitForResponse(response => response.url().endsWith(`/admissions/${applicationId}/actions`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save decision", exact: true }).click();
    expect((await decided).status()).toBe(201);
    await page.getByPlaceholder("Amount", { exact: true }).fill("1000");
    const paid = page.waitForResponse(response => response.url().endsWith(`/admissions/${applicationId}/actions`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Record payment", exact: true }).click();
    expect((await paid).status()).toBe(201);
    await page.getByPlaceholder("Student ID", { exact: true }).fill("BROWSER-STUDENT-1");
    await page.getByPlaceholder("Admission number", { exact: true }).fill("BROWSER-ADM-1");
    await page.getByPlaceholder("Section", { exact: true }).fill("A");
    const enrolled = page.waitForResponse(response => response.url().endsWith(`/admissions/${applicationId}/actions`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Enroll student", exact: true }).click();
    const enrollment = await enrolled;
    expect(enrollment.status()).toBe(201);
    enrollmentId = (await enrollment.json()).id;
    const saved = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    expect(saved.studentIdentityId).toBeTruthy();
    const dashboard = await page.request.get("/api/dashboard");
    expect((await dashboard.json()).students).toBe(1);
  });

  await test.step("save attendance and verify persistence", async () => {
    await page.goto("/attendance");
    await expect(page.getByRole("row").filter({ hasText: studentName })).toBeVisible();
    const saved = page.waitForResponse(response => response.url().endsWith("/api/attendance") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Save Attendance", exact: true }).click();
    expect((await saved).ok()).toBe(true);
    expect(await prisma.attendance.count({ where: { studentId: enrollmentId, status: "PRESENT" } })).toBe(1);
  });

  await test.step("create and pay a fee invoice", async () => {
    await page.goto("/fees");
    const invoice = page.locator("form").filter({ has: page.getByRole("button", { name: "Create Invoice", exact: true }) });
    await invoice.getByRole("combobox", { name: /^Student/ }).selectOption(enrollmentId);
    await invoice.getByLabel("Amount (PKR)", { exact: true }).fill("500");
    await invoice.getByLabel("Due date", { exact: true }).fill(`${year}-12-01`);
    const created = page.waitForResponse(response => response.url().endsWith("/api/fees") && response.request().method() === "POST");
    await invoice.getByRole("button", { name: "Create Invoice", exact: true }).click();
    const result = await created;
    expect(result.status()).toBe(201);
    const invoiceId = (await result.json()).id;
    const payment = page.locator("form").filter({ has: page.getByRole("button", { name: "Record Payment", exact: true }) });
    await payment.getByRole("combobox", { name: /^Invoice/ }).selectOption(invoiceId);
    await payment.getByLabel("Amount (PKR)", { exact: true }).fill("500");
    const paid = page.waitForResponse(response => response.url().endsWith("/api/fees") && response.request().method() === "POST");
    await payment.getByRole("button", { name: "Record Payment", exact: true }).click();
    expect((await paid).status()).toBe(201);
    await expect(page.getByRole("row").filter({ hasText: studentName })).toContainText("PAID");
  });

  await test.step("enter, schedule and publish all three term examinations", async () => {
    for (const term of ["FIRST", "SECOND", "THIRD"]) {
      await page.goto("/examinations");
      await page.getByLabel("Exam name", { exact: true }).fill(`Browser ${term}`);
      await page.getByRole("combobox", { name: /^Report card term/ }).selectOption(term);
      await page.getByLabel("Start date", { exact: true }).fill(`${year}-10-01`);
      await page.getByLabel("End date", { exact: true }).fill(`${year}-10-02`);
      await page.getByLabel("Class", { exact: true }).fill(className);
      await page.getByLabel("Subject", { exact: true }).fill("English");
      const created = page.waitForResponse(response => response.url().endsWith("/api/exams") && response.request().method() === "POST");
      await page.getByRole("button", { name: "Create Examination", exact: true }).click();
      const response = await created;
      expect(response.status()).toBe(201);
      const exam = await response.json();
      await page.goto(`/examinations/${exam.id}`);
      await expect(page.getByRole("row").filter({ hasText: studentName })).toBeVisible();
      await page.locator("input.marks-input").fill("90");
      const saved = page.waitForResponse(response => response.url().endsWith("/api/results") && response.request().method() === "POST");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      expect((await saved).ok()).toBe(true);
      await page.getByRole("button", { name: "Schedule Examination", exact: true }).click();
      await page.getByRole("button", { name: "Publish Results", exact: true }).click();
      await expect(page.locator("input.marks-input")).toBeDisabled();
    }
  });

  await test.step("render and release the annual report, then reject changes", async () => {
    await page.goto("/report-cards");
    await page.locator("select").first().selectOption(enrollmentId);
    await expect(page.locator("body")).toContainText("Annual result:");
    const report = await page.request.get(`/api/report-cards?studentId=${enrollmentId}`);
    const record = await report.json();
    expect(record.final.complete).toBe(true);
    expect(record.final.obtainedMarks).toBe(270);
    await page.goto("/admin/report-card-release");
    await page.locator("select").selectOption(enrollmentId);
    await page.getByRole("button", { name: "Release Official Report Card", exact: true }).click();
    await expect(page.locator("body")).toContainText("Report card officially released and locked.");
    // A draft paper isolates the release guard from the published-exam guard.
    const enrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    const draft = await prisma.exam.create({ data: { name: "Post-release guard", type: "OTHER", sessionId: enrollment.academicSessionId!, startDate: new Date(), endDate: new Date(), papers: { create: { className, subject: "English", maxMarks: 100, passMarks: 40 } } }, include: { papers: true } });
    const rejected = await page.request.post("/api/results/bulk", { data: { paperId: draft.papers[0].id, entries: [{ studentId: enrollmentId, marks: 50 }] } });
    expect(rejected.status()).toBe(409);
    expect(await prisma.result.count({ where: { paperId: draft.papers[0].id } })).toBe(0);
    const released = await page.request.get(`/api/report-cards?studentId=${enrollmentId}`);
    expect((await released.json()).released).toBe(true);
  });
});

test("scheduled delivery requires its cron token even for an administrator", async ({ request }) => {
  const login = await request.post("/api/auth/login", { data: { identifier: "browser-admin", password: process.env.E2E_ADMIN_PASSWORD } });
  expect(login.status()).toBe(200);
  expect((await request.get("/api/communication/process")).status()).toBe(401);
  const processed = await request.get("/api/communication/process", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(processed.status()).toBe(200);
});
