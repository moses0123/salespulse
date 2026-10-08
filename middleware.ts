import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge middleware: redirect unauthenticated page requests to /login.
 *
 * This is a UX guard only (fast, no DB round-trip, runs on the edge) — every
 * API route independently re-verifies the session server-side via
 * getSessionUser()/requireRole() before touching the database, so this
 * middleware being edge-only is not a security hole.
 */
const SESSION_COOKIE = "salespulse_session";
const PUBLIC_PATHS = ["/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never gate API routes, static assets, or Next internals here.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/templates/") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.json"
  ) {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verify(token) : null;

  if (!isPublic && !session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isPublic && session) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

async function verify(token: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
