import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Meeting } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { isManager } from "@/lib/scope";
import { MEETING_OUTCOMES, MEETING_OUTCOME_RULES } from "@/lib/sales";
import { FOLLOW_UP_CHANNELS } from "@/models/FollowUp";
import { recordMeetingOutcome, addActivity, refreshNextAction } from "@/lib/leadService";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("outcome"),
    outcome: z.enum(MEETING_OUTCOMES),
    notes: z.string().optional(),
    dealValue: z.number().nonnegative().nullable().optional(),
    nextAction: z.object({ title: z.string().min(1), dueAt: z.string(), channel: z.enum(FOLLOW_UP_CHANNELS).optional() }).nullable().optional(),
    rescheduleTo: z.string().nullable().optional(),
  }),
  z.object({ action: z.literal("cancel"), reason: z.string().optional() }),
]);

/** PATCH /api/meetings/:id — record the outcome (incl. reschedule) or cancel. */
export const PATCH = withErrorHandling(async (req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const meeting = await Meeting.findById(params.id).lean();
  if (!meeting) return fail("Meeting not found", 404);
  if (!isManager(user) && String(meeting.ownerId) !== String(user!._id)) return fail("Forbidden", 403);
  if (meeting.status !== "Scheduled") return fail("This meeting is already closed", 409);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const d = parsed.data;

  if (d.action === "cancel") {
    await Meeting.updateOne({ _id: meeting._id }, { status: "Cancelled", outcomeNotes: d.reason ?? "" });
    await addActivity({ leadId: meeting.leadId, userId: user!._id, type: "note", summary: "Meeting cancelled", notes: d.reason });
    await refreshNextAction(meeting.leadId);
    return ok({ cancelled: true });
  }

  const rule = MEETING_OUTCOME_RULES[d.outcome];
  if (rule.nextAction === "required" && !d.nextAction) return fail(`"${rule.label}" needs a next action — set a follow-up date.`, 422);
  if (rule.nextAction === "reschedule" && !d.rescheduleTo) return fail("Pick the new meeting date/time", 422);

  const updated = await recordMeetingOutcome(meeting._id, user!, {
    outcome: d.outcome,
    notes: d.notes,
    dealValue: d.dealValue ?? null,
    nextAction: d.nextAction ? { ...d.nextAction, dueAt: new Date(d.nextAction.dueAt) } : null,
    rescheduleTo: d.rescheduleTo ? new Date(d.rescheduleTo) : null,
  });
  return ok(updated);
});
