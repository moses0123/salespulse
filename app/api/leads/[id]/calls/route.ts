import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Lead } from "@/models";
import type { ILead } from "@/models/Lead";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { canAccessLead } from "@/lib/scope";
import { CALL_OUTCOMES, OUTCOME_RULES, TEMPERATURES, NEXT_ACTIONS, NOT_INTERESTED_REASONS, FOLLOW_UP_ACTIONS } from "@/lib/sales";
import { FOLLOW_UP_CHANNELS } from "@/models/FollowUp";
import { MEETING_TYPES } from "@/models/Meeting";
import { logCall } from "@/lib/leadService";
import { LEAD_POPULATE, serializeLead } from "@/lib/serializers";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

const schema = z.object({
  outcome: z.enum(CALL_OUTCOMES),
  notes: z.string().max(5000).optional(),
  productId: z.string().nullable().optional(),
  productIds: z.array(z.string()).max(20).optional(),
  durationMins: z.number().min(0).max(600).nullable().optional(),
  reason: z.enum(NOT_INTERESTED_REASONS).nullable().optional(),
  nextActionLabel: z.enum(NEXT_ACTIONS).nullable().optional(),
  temperature: z.enum(TEMPERATURES).nullable().optional(),
  needIdentified: z.boolean().optional(),
  askedPricing: z.boolean().optional(),
  dealValue: z.number().nonnegative().nullable().optional(),
  followUpId: z.string().nullable().optional(),
  nextAction: z
    .object({ title: z.string().trim().min(1), dueAt: z.string(), channel: z.enum(FOLLOW_UP_CHANNELS).optional() })
    .nullable()
    .optional(),
  meeting: z
    .object({
      scheduledAt: z.string(),
      type: z.enum(MEETING_TYPES).optional(),
      durationMins: z.number().int().positive().max(600).optional(),
      location: z.string().optional(),
      agenda: z.string().optional(),
    })
    .nullable()
    .optional(),
});

/**
 * POST /api/leads/:id/calls — record a call outcome.
 * Enforces "every lead should always have a clear next action": outcomes
 * that keep the lead open require a follow-up date (or a meeting for
 * "Meeting booked") or the call is rejected.
 */
export const POST = withErrorHandling(async (req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const lead = await Lead.findById(params.id).lean();
  if (!lead) return fail("Lead not found", 404);
  if (!canAccessLead(user!, lead)) return fail("Forbidden — this lead is assigned to someone else", 403);
  if (lead.doNotContact) return fail("This lead is marked Do Not Contact", 409);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const d = parsed.data;
  const rule = OUTCOME_RULES[d.outcome];

  if (rule.nextAction === "required" && !d.nextAction) {
    return fail(`"${rule.label}" needs a next action — set a follow-up date/time.`, 422);
  }
  if (d.outcome === "not_interested" && !d.reason) {
    return fail("Pick the reason they're not interested.", 422);
  }
  if (rule.nextAction === "required" && d.nextActionLabel && !(FOLLOW_UP_ACTIONS as readonly string[]).includes(d.nextActionLabel)) {
    return fail(`"${d.nextActionLabel}" doesn't schedule anything — pick a next action with a date.`, 422);
  }
  if (rule.nextAction === "meeting" && !d.meeting) {
    return fail("Set the meeting date/time for a booked meeting.", 422);
  }
  const nextDue = d.nextAction ? new Date(d.nextAction.dueAt) : null;
  if (nextDue && isNaN(nextDue.getTime())) return fail("Invalid follow-up date", 422);
  const meetingAt = d.meeting ? new Date(d.meeting.scheduledAt) : null;
  if (meetingAt && isNaN(meetingAt.getTime())) return fail("Invalid meeting date", 422);

  const result = await logCall(lead as ILead, user!, {
    outcome: d.outcome,
    notes: d.notes,
    productId: d.productId,
    productIds: d.productIds,
    durationMins: d.durationMins ?? null,
    reason: d.reason ?? null,
    nextActionLabel: d.nextActionLabel ?? null,
    temperature: d.temperature ?? null,
    needIdentified: d.needIdentified,
    askedPricing: d.askedPricing,
    dealValue: d.dealValue ?? null,
    followUpId: d.followUpId ?? null,
    nextAction: d.nextAction && nextDue ? { title: d.nextAction.title, dueAt: nextDue, channel: d.nextAction.channel } : null,
    meeting: d.meeting && meetingAt ? { ...d.meeting,  scheduledAt: meetingAt } : null,
  });

  const full = await Lead.findById(params.id).populate(LEAD_POPULATE).lean();
  return ok({ lead: serializeLead(full), activityId: String(result.activity._id) }, 201);
});
