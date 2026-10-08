import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { FollowUp, Lead } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { isManager } from "@/lib/scope";
import { addActivity, refreshNextAction } from "@/lib/leadService";
import { formatDateTimeShort } from "@/lib/utils";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("complete"), note: z.string().optional() }),
  z.object({ action: z.literal("reschedule"), dueAt: z.string(), reason: z.string().optional() }),
  z.object({ action: z.literal("cancel"), reason: z.string().optional() }),
]);

/**
 * PATCH /api/follow-ups/:id — complete (without a call, e.g. a WhatsApp was
 * sent), reschedule, or cancel. Completing via a call goes through
 * POST /api/leads/:id/calls with followUpId instead.
 */
export const PATCH = withErrorHandling(async (req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const fu = await FollowUp.findById(params.id);
  if (!fu) return fail("Follow-up not found", 404);
  if (!isManager(user) && String(fu.assignedTo) !== String(user!._id)) return fail("Forbidden", 403);
  if (fu.status !== "Pending") return fail("This follow-up is already closed", 409);

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const d = parsed.data;

  if (d.action === "complete") {
    fu.status = "Completed";
    fu.completedAt = new Date();
    fu.completedBy = user!._id;
    fu.completionNote = d.note ?? "";
    await fu.save();
    await addActivity({ leadId: fu.leadId, userId: user!._id, type: "follow_up_completed", summary: `Follow-up completed: ${fu.title}`, notes: d.note });
    await Lead.updateOne({ _id: fu.leadId }, { lastContactAt: new Date() });
  } else if (d.action === "reschedule") {
    const dueAt = new Date(d.dueAt);
    if (isNaN(dueAt.getTime())) return fail("Invalid date", 422);
    const from = fu.dueAt;
    fu.dueAt = dueAt;
    fu.rescheduleCount += 1;
    fu.reminderSentAt = null;
    fu.escalatedAt = null;
    await fu.save();
    await addActivity({
      leadId: fu.leadId,
      userId: user!._id,
      type: "follow_up_rescheduled",
      summary: `Follow-up rescheduled: ${formatDateTimeShort(from)} → ${formatDateTimeShort(dueAt)}`,
      notes: d.reason,
    });
  } else {
    fu.status = "Cancelled";
    fu.completedAt = new Date();
    fu.completedBy = user!._id;
    fu.completionNote = d.reason ?? "Cancelled";
    await fu.save();
    await addActivity({ leadId: fu.leadId, userId: user!._id, type: "note", summary: `Follow-up cancelled: ${fu.title}`, notes: d.reason });
  }
  await refreshNextAction(fu.leadId);
  return ok(fu);
});
