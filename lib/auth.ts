import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import { User } from "@/models";
import type { IUser, UserRole } from "@/models/User";
import { fail } from "@/lib/api";

export const SESSION_COOKIE = "salespulse_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "Missing JWT_SECRET environment variable. Add it to your .env.local file."
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string; // user id
}

/** Sign a session JWT for a given user id. */
export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

/** Verify a session JWT, returning its payload or null if invalid/expired. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Resolve the signed-in user for the current request from the session
 * cookie. Returns null if there is no valid session — callers are
 * responsible for turning that into a 401 (see requireRole below).
 */
export async function getSessionUser(): Promise<IUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  await connectDB();
  const user = await User.findById(payload.sub).lean();
  if (!user || !user.isActive) return null;

  return user as IUser;
}

/**
 * Guard clause for route handlers: returns a Response to short-circuit with
 * if the user is missing or lacks the required role, or null to continue.
 *
 * Usage:
 *   const user = await getSessionUser();
 *   const denied = requireRole(user, ["admin", "manager"]);
 *   if (denied) return denied;
 */
export function requireRole(user: IUser | null, roles: UserRole[]): Response | null {
  if (!user) return fail("Unauthorized — please sign in", 401);
  if (!roles.includes(user.role)) {
    return fail("Forbidden — your role does not have access to this action", 403);
  }
  return null;
}

/** Guard clause that only requires an authenticated session, any role. */
export function requireAuth(user: IUser | null): Response | null {
  if (!user) return fail("Unauthorized — please sign in", 401);
  return null;
}
