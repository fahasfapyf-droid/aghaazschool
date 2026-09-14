import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionTokenEdge } from "@/lib/session-edge";

const publicPaths = new Set(["/login", "/api/auth/login"]);
const roleRules: Array<[string, string[]]> = [
  ["/admissions", ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"]],
  ["/fees", ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"]],
  ["/attendance", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/examinations", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/results", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/timetable", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/homework", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/communication", ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"]],
  ["/leave", ["SUPER_ADMIN", "ADMIN", "TEACHER", "RECEPTIONIST"]],
];

function requiredRoles(pathname: string) {
  for (const [prefix, roles] of roleRules) if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return roles;
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.has(pathname)) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();

  const session = await verifySessionTokenEdge(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const roles = requiredRoles(pathname);
  if (roles && !roles.includes(session.role)) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "You do not have permission to access this resource." }, { status: 403 });
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
