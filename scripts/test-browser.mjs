import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const databaseUrl = new URL(process.env.DATABASE_URL || "");
if (!["127.0.0.1", "localhost"].includes(databaseUrl.hostname)) throw new Error("Browser tests require a local PostgreSQL instance so they can create and remove their own isolated database.");
const databaseName = `aghaaz_e2e_${randomUUID().replaceAll("-", "")}`;
const prisma = new PrismaClient();
const testUrl = new URL(databaseUrl);
testUrl.pathname = `/${databaseName}`;
const password = randomBytes(24).toString("base64url");
const childEnv = { ...process.env, DATABASE_URL: testUrl.href, ADMIN_USERNAME: "browser-admin", ADMIN_PASSWORD: password, E2E_ADMIN_PASSWORD: password, CRON_SECRET: randomBytes(32).toString("hex"), NEXT_TELEMETRY_DISABLED: "1" };
delete childEnv.COMMUNICATION_EMAIL_WEBHOOK_URL;
delete childEnv.COMMUNICATION_SMS_WEBHOOK_URL;

function run(path, args = [], capture = false) {
  const result = spawnSync(process.execPath, [path, ...args], { env: childEnv, stdio: capture ? "pipe" : "inherit", encoding: "utf8" });
  if (result.status !== 0) {
    if (capture) console.error(result.stdout, result.stderr);
    throw new Error(`Browser prerequisite failed: ${path} (exit ${result.status})`);
  }
  return result;
}

try {
  await prisma.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  try {
    run("node_modules/prisma/build/index.js", ["migrate", "deploy"], true);
    run("scripts/create-admin.mjs");
    run("scripts/create-admin.mjs");
    console.log("Isolated database prepared; repeated administrator provisioning preserved credentials.");
    const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], { env: childEnv, stdio: "inherit" });
    process.exitCode = result.status ?? 1;
  } finally {
    await prisma.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
