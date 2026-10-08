import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { User } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireRole, hashPassword } from "@/lib/auth";

// This route reads from the database on every request — never statically cache it.
export const dynamic = "force-dynamic";

const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  role: z.enum(["admin", "manager", "telemarketer"]),
  dailyCallTarget: z.number().int().min(0).max(1000).optional(),
  managerId: z.string().nullable().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * GET /api/users?role=manager
 * Fetch the user directory, optionally filtered by role. Any signed-in user
 * can read it — it powers assignee/PM pickers across every role.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireRole(user, ["admin", "manager", "telemarketer"]);
  if (denied) return denied;

  const role = req.nextUrl.searchParams.get("role");
  const query: Record<string, unknown> = {};
  if (req.nextUrl.searchParams.get("active") === "1") query.isActive = true;
  if (role) {
    if (!["admin", "manager", "telemarketer"].includes(role)) {
      return fail("Invalid role filter", 400);
    }
    query.role = role;
  }

  const users = await User.find(query).sort({ name: 1 }).lean();
  return ok(users);
});

/**
 * POST /api/users
 * Create a team member and assign a role (Super Admin / Sales Manager / Telemarketer).
 * Restricted to Super Admin — this is how every account, including other
 * PMs, gets provisioned. There is no public signup.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const actingUser = await getSessionUser();
  const denied = requireRole(actingUser, ["admin"]);
  if (denied) return denied;

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid input", 422, parsed.error.flatten());
  }

  const { name, email, phone, role, managerId, password, dailyCallTarget } = parsed.data;

  if (managerId) {
    const manager = await User.findById(managerId).lean();
    if (!manager) return fail("managerId does not reference an existing user", 422);
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({
    name,
    email,
    phone,
    role,
    managerId: managerId || null,
    dailyCallTarget: dailyCallTarget ?? 40,
    passwordHash,
  });

  const { passwordHash: _omit, ...safeUser } = user.toObject();
  return ok(safeUser, 201);
});
