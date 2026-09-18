import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { createPasswordHash } from "@/lib/auth";

function configuredSecret() {
  const value = process.env.BOOTSTRAP_ADMIN_SECRET?.trim();
  if (!value || value.length < 32) return null;
  return value;
}

function secretsMatch(provided: string, configured: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const configured = configuredSecret();
  if (!configured) {
    return NextResponse.json({ error: "Admin bootstrap is not enabled." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const bootstrapSecret = String(body.bootstrapSecret ?? "").trim();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!secretsMatch(bootstrapSecret, configured)) {
      return NextResponse.json({ error: "Invalid bootstrap secret." }, { status: 401 });
    }

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: "Name must be between 2 and 100 characters." }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (password.length < 12 || password.length > 128) {
      return NextResponse.json({ error: "Password must be 12–128 characters." }, { status: 400 });
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('aghaaz_admin_bootstrap'))`;

      const existingSuperAdmin = await tx.user.findFirst({
        where: { role: "SUPER_ADMIN", active: true },
        select: { id: true },
      });
      if (existingSuperAdmin) {
        throw new Error("ADMIN_BOOTSTRAP_CLOSED");
      }

      const existingUser = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingUser) {
        throw new Error("EMAIL_ALREADY_EXISTS");
      }

      return tx.user.create({
        data: {
          name,
          email,
          passwordHash: createPasswordHash(password),
          role: "SUPER_ADMIN",
          active: true,
        },
        select: { id: true, name: true, email: true, role: true },
      });
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Error && error.message === "ADMIN_BOOTSTRAP_CLOSED") {
      return NextResponse.json({ error: "Admin bootstrap is already closed because an active super administrator exists." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "EMAIL_ALREADY_EXISTS") {
      return NextResponse.json({ error: "That email address already belongs to a user." }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create the administrator." }, { status: 500 });
  }
}
