import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { User } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { signSessionToken, verifyPassword, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

/**
 * POST /api/auth/login
 * Verifies credentials and sets an httpOnly session cookie. There is no
 * self-signup — accounts are provisioned by a Super Admin via /api/users.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  await connectDB();

  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid input", 422, parsed.error.flatten());
  }
  const { email, password } = parsed.data;

  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
  if (!user || !user.isActive) {
    return fail("Invalid email or password", 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return fail("Invalid email or password", 401);
  }

  const token = await signSessionToken(user._id.toString());
  const { passwordHash, ...safeUser } = user.toObject();

  const res = ok(safeUser);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
});
