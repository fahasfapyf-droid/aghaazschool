import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function matchesPassword(password, hash) {
  const [scheme, salt, encoded] = hash.split("$");
  if (scheme !== "scrypt" || !salt || !encoded) return false;
  const expected = Buffer.from(encoded, "base64url");
  if (expected.length !== 64) return false;
  return timingSafeEqual(expected, scryptSync(password, salt, 64));
}

async function main() {
  const name = (process.env.ADMIN_NAME || "School Administrator").trim();
  const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
  const phone = process.env.ADMIN_PHONE?.trim().replace(/[\s().-]/g, "") || null;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12 || password.length > 128) throw new Error("Set ADMIN_PASSWORD securely to a password of 12–128 characters. Passwords are never printed.");
  if (name.length < 2 || name.length > 100) throw new Error("ADMIN_NAME must contain 2–100 characters.");
  if (!/^[a-z][a-z0-9._-]{2,49}$/.test(username)) throw new Error("ADMIN_USERNAME must contain 3–50 letters, numbers, dots, underscores or hyphens and start with a letter.");
  if (phone && !/^\+?\d{8,15}$/.test(phone)) throw new Error("ADMIN_PHONE must contain 8–15 digits, with an optional leading plus sign.");
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) throw new Error("ADMIN_EMAIL must be a valid email address.");

  const created = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('aghaaz_admin_bootstrap'))`;
    const existing = await tx.user.findFirst({ where: { OR: [{ username }, ...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])] } });
    if (existing) {
      if (existing.username === username && existing.role === "SUPER_ADMIN" && existing.active && matchesPassword(password, existing.passwordHash)) return false;
      throw new Error("An account with this login already exists. Its credentials and permissions were not changed.");
    }
    if (await tx.user.findFirst({ where: { role: "SUPER_ADMIN", active: true } })) throw new Error("An active super administrator already exists. Manage additional accounts through Administration.");
    const salt = randomBytes(16).toString("base64url");
    const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("base64url")}`;
    await tx.user.create({ data: { name, username, phone, email, passwordHash, role: "SUPER_ADMIN", mustChangePassword: false } });
    return true;
  });
  console.log(created ? "Super administrator created. Sign in with ADMIN_USERNAME and the securely supplied password." : "Super administrator already exists; existing credentials were preserved.");
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
