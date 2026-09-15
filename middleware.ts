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
  ["/students", ["SUPER_ADMIN", "ADMIN", "TEACHER", "RECEPTIONIST"]],
  ["/api/admissions", ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"]],
  ["/api/fees", ["SUPER_ADMIN", "ADMIN", "ACCOUNTANT"]],
  ["/api/attendance", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/api/examinations", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/api/results", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/api/timetable", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/api/homework", ["SUPER_ADMIN", "ADMIN", "TEACHER"]],
  ["/api/communication", ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"]],
  ["/api/leave", ["SUPER_ADMIN", "ADMIN", "TEACHER", "RECEPTIONIST"]],
  ["/api/students", ["SUPER_ADMIN", "ADMIN", "TEACHER", "RECEPTIONIST"]],
  ["/api/dashboard", ["SUPER_ADMIN", "ADMIN", "TEACHER", "ACCOUNTANT", "RECEPTIONIST"]],
];

function requiredRoles(pathname: string) {
  for (const [prefix, roles] of roleRules) if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return roles;
  return null;
}

function secureResponse(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") return NextResponse.next();
  if (publicPaths.has(pathname)) return secureResponse(NextResponse.next());

  const session = await verifySessionTokenEdge(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) return secureResponse(NextResponse.json({ error: "Authentication required." }, { status: 401 }));
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return secureResponse(NextResponse.redirect(login));
  }

  const roles = requiredRoles(pathname);
  if (roles && !roles.includes(session.role)) {
    if (pathname.startsWith("/api/")) return secureResponse(NextResponse.json({ error: "You do not have permission to access this resource." }, { status: 403 }));
    return secureResponse(NextResponse.redirect(new URL("/", request.url)));
  }

  return secureResponse(NextResponse.next());
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
