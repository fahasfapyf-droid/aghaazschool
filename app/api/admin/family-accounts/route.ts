import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPasswordHash, requireUser } from "@/lib/auth";
import { requestAuditContext, writeAuditLog } from "@/lib/audit";

async function authorize() {
  const user = await requireUser();
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

export async function GET() {
  try {
    await authorize();
    const accounts = await prisma.familyAccount.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            active: true,
            createdAt: true,
          },
        },
        students: {
          include: {
            enrollment: {
              include: {
                application: { select: { studentName: true } },
                academicGrade: { select: { name: true } },
                academicSection: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    return NextResponse.json({ accounts });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "FORBIDDEN";
    return NextResponse.json(
      { error: forbidden ? "Administrator access required." : "Authentication required." },
      { status: forbidden ? 403 : 401 },
    );
  }
}

export async function POST(request: NextRequest) {
  const context = requestAuditContext(request);
  try {
    const actor = await authorize();
    const body = await request.json();
    const name = String(body.name || "").trim();
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const enrollmentIds = Array.isArray(body.enrollmentIds)
      ? [...new Set(body.enrollmentIds.map(String).filter(Boolean))]
      : [];

    if (name.length < 2 || name.length > 100) {
      return NextResponse.json({ error: "Family name must be 2–100 characters." }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
      return NextResponse.json(
        { error: "Username must be 3–40 characters and use letters, numbers, dot, underscore or hyphen." },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (!enrollmentIds.length) {
      return NextResponse.json({ error: "Link at least one student." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: "That username is already assigned." }, { status: 409 });
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        id: { in: enrollmentIds },
        status: { notIn: ["WITHDRAWN", "TRANSFERRED"] },
      },
      select: { id: true },
    });
    if (enrollments.length !== enrollmentIds.length) {
      return NextResponse.json(
        { error: "One or more selected students are not active enrollments." },
        { status: 400 },
      );
    }

    const alreadyLinked = await prisma.familyAccountStudent.findMany({
      where: { enrollmentId: { in: enrollmentIds } },
      select: { enrollmentId: true },
    });
    if (alreadyLinked.length) {
      return NextResponse.json(
        { error: "One or more students are already linked to a Family account." },
        { status: 409 },
      );
    }

    const account = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          username,
          passwordHash: createPasswordHash(password),
          role: UserRole.FAMILY,
          mustChangePassword: false,
        },
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          active: true,
        },
      });

      const family = await tx.familyAccount.create({ data: { userId: user.id } });

      await tx.familyAccountStudent.createMany({
        data: enrollmentIds.map((enrollmentId) => ({
          familyAccountId: family.id,
          enrollmentId,
        })),
      });

      return tx.familyAccount.findUniqueOrThrow({
        where: { id: family.id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              active: true,
            },
          },
          students: {
            include: {
              enrollment: {
                include: {
                  application: { select: { studentName: true } },
                },
              },
            },
          },
        },
      });
    });

    await writeAuditLog({
      userId: actor.id,
      action: "FAMILY_ACCOUNT_CREATED",
      entityType: "FamilyAccount",
      entityId: account.id,
      metadata: { username, enrollmentIds },
      context,
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That username or account already exists." }, { status: 409 });
    }
    const forbidden = error instanceof Error && error.message === "FORBIDDEN";
    return NextResponse.json(
      { error: forbidden ? "Administrator access required." : "Unable to create Family account." },
      { status: forbidden ? 403 : 500 },
    );
  }
}
