import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { User, Lead, Activity } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: { id: string };
}

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(["admin", "manager", "telemarketer"]).optional(),
  dailyCallTarget: z.number().int().min(0).max(1000).optional(),
  name: z.string().min(1).optional(),
  managerId: z.string().nullable().optional(),
  phone: z.string().optional(),
});

/**
 * PATCH /api/users/[id]
 * Update a user's role, manager, phone, or active state (suspend/reactivate
 * an account without deleting its history). Super Admin only.
 */
export const PATCH = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  await connectDB();
  const actingUser = await getSessionUser();
  const denied = requireRole(actingUser, ["admin"]);
  if (denied) return denied;

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());

  if (params.id === String(actingUser!._id) && parsed.data.isActive === false) {
    return fail("You can't deactivate your own account", 400);
  }

  const user = await User.findByIdAndUpdate(params.id, parsed.data, { new: true }).lean();
  if (!user) return fail("User not found", 404);

  return ok(user);
});

/**
 * DELETE /api/users/[id]
 * Permanently removes an account. Super Admin only, and only for a user
 * with no footprint on record — no leads assigned to or created by them
 * and no logged activity. That keeps every other
 * record's references (a project's PM, a task's assignee/creator) always
 * resolvable instead of silently dangling. A user who has any of that
 * history can't be deleted — suspend them instead (the Users page toggle)
 * to block sign-in without losing the audit trail.
 */
export const DELETE = withErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  await connectDB();
  const actingUser = await getSessionUser();
  const denied = requireRole(actingUser, ["admin"]);
  if (denied) return denied;

  if (params.id === String(actingUser!._id)) {
    return fail("You can't delete your own account", 400);
  }

  const target = await User.findById(params.id);
  if (!target) return fail("User not found", 404);

  const [hasLeads, hasActivity] = await Promise.all([
    Lead.exists({ $or: [{ assignedTo: params.id }, { createdBy: params.id }] }),
    Activity.exists({ userId: params.id }),
  ]);

  if (hasLeads || hasActivity) {
    return fail(
      "This user has leads or logged activity on record — suspend their account instead (Users page) so that history stays intact.",
      409
    );
  }

  await target.deleteOne();
  return ok({ deleted: true });
});
