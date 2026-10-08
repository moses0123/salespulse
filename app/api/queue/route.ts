import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { FollowUp, Meeting, Lead, User } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { isManager } from "@/lib/scope";
import { dayRange } from "@/lib/time";
import { metricsTotal } from "@/lib/metrics";
import { OPEN_STAGES, DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/sales";
import { getSettingsWithSecrets } from "@/lib/settings";
import { FOLLOW_UP_POPULATE, MEETING_POPULATE, LEAD_POPULATE, serializeFollowUps, serializeMeetings, serializeLeads } from "@/lib/serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/queue?userId= — the telemarketer's daily workspace: today's
 * numbers against target, overdue + due-today follow-ups, today's meetings,
 * hot leads, and fresh leads to call. Managers may view anyone's queue.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const requested = req.nextUrl.searchParams.get("userId");
  if (requested && requested !== String(user!._id) && !isManager(user)) return fail("Forbidden", 403);
  const target = requested ? await User.findById(requested).lean() : user!;
  if (!target) return fail("User not found", 404);

  const today = dayRange();
  const now = new Date();
  const uid = target._id;

  const [metrics, overdue, dueToday, meetingsToday, newLeads, newLeadsTotal, hotLeads, settings] = await Promise.all([
    metricsTotal({ start: today.start, end: today.end, userIds: [uid] }),
    FollowUp.find({ assignedTo: uid, status: "Pending", dueAt: { $lt: now } }).sort({ dueAt: 1 }).limit(100).populate(FOLLOW_UP_POPULATE).lean(),
    FollowUp.find({ assignedTo: uid, status: "Pending", dueAt: { $gte: now, $lt: today.end } }).sort({ dueAt: 1 }).populate(FOLLOW_UP_POPULATE).lean(),
    Meeting.find({ ownerId: uid, status: "Scheduled", scheduledAt: { $gte: today.start, $lt: today.end } }).sort({ scheduledAt: 1 }).populate(MEETING_POPULATE).lean(),
    Lead.find({ assignedTo: uid, stage: "New", doNotContact: false, nextActionAt: null }).sort({ score: -1, assignedAt: 1 }).limit(50).populate(LEAD_POPULATE).lean(),
    Lead.countDocuments({ assignedTo: uid, stage: "New", doNotContact: false, nextActionAt: null }),
    Lead.find({
      assignedTo: uid,
      temperature: "Hot",
      stage: { $in: OPEN_STAGES },
      $or: [{ nextActionAt: null }, { nextActionAt: { $gte: today.end } }],
    })
      .sort({ score: -1 })
      .limit(10)
      .populate(LEAD_POPULATE)
      .lean(),
    getSettingsWithSecrets(),
  ]);

  return ok({
    user: { _id: String(target._id), name: target.name, role: target.role, dailyCallTarget: target.dailyCallTarget ?? 40 },
    today: metrics,
    overdue: serializeFollowUps(overdue),
    dueToday: serializeFollowUps(dueToday),
    meetingsToday: serializeMeetings(meetingsToday),
    newLeads: serializeLeads(newLeads),
    newLeadsTotal,
    hotLeads: serializeLeads(hotLeads),
    whatsappTemplate: settings?.sales?.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
  });
});
