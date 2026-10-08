import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Lead } from "@/models";
import type { ILead } from "@/models/Lead";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { canAccessLead, isManager } from "@/lib/scope";
import { MEETING_TYPES } from "@/models/Meeting";
import { bookMeeting, refreshNextAction, changeStage } from "@/lib/leadService";
import { advanceStage } from "@/lib/sales";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

const schema = z.object({
  scheduledAt: z.string(),
  type: z.enum(MEETING_TYPES).optional(),
  durationMins: z.number().int().positive().max(600).optional(),
  location: z.string().optional(),
  agenda: z.string().optional(),
  productId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});

/** POST /api/leads/:id/meetings — book a meeting directly (moves the lead to at least "Meeting Booked"). */
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
  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (isNaN(scheduledAt.getTime())) return fail("Invalid date", 422);

  const meeting = await bookMeeting({
    lead,
    actor: user!,
    scheduledAt,
    type: parsed.data.type,
    durationMins: parsed.data.durationMins,
    location: parsed.data.location,
    agenda: parsed.data.agenda,
    productId: parsed.data.productId ?? lead.productId ?? null,
    ownerId: isManager(user) ? parsed.data.ownerId ?? null : null,
  });
  const target = advanceStage(lead.stage, "Meeting Booked");
  if (target !== lead.stage && lead.stage !== "Won") await changeStage(lead as ILead, user!, target);
  await refreshNextAction(lead._id);
  return ok(meeting, 201);
});
