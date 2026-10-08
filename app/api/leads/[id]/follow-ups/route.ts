import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Lead, User } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { canAccessLead, isManager } from "@/lib/scope";
import { FOLLOW_UP_CHANNELS } from "@/models/FollowUp";
import { createFollowUp, refreshNextAction } from "@/lib/leadService";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

const schema = z.object({
  title: z.string().trim().min(1),
  dueAt: z.string(),
  channel: z.enum(FOLLOW_UP_CHANNELS).optional(),
  assignedTo: z.string().nullable().optional(),
});

/** POST /api/leads/:id/follow-ups — schedule a follow-up without logging a call. */
export const POST = withErrorHandling(async (req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const lead = await Lead.findById(params.id).lean();
  if (!lead) return fail("Lead not found", 404);
  if (!canAccessLead(user!, lead)) return fail("Forbidden", 403);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const dueAt = new Date(parsed.data.dueAt);
  if (isNaN(dueAt.getTime())) return fail("Invalid date", 422);
  let assignedTo = parsed.data.assignedTo ?? null;
  if (assignedTo && !isManager(user)) assignedTo = null;
  if (assignedTo && !(await User.exists({ _id: assignedTo, isActive: true }))) return fail("Assignee not found", 422);

  const fu = await createFollowUp({
    lead,
    actor: user!,
    title: parsed.data.title,
    dueAt,
    channel: parsed.data.channel,
    assignedTo,
    notifyAssignee: true,
  });
  await refreshNextAction(lead._id);
  return ok(fu, 201);
});
