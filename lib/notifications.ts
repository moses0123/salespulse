import "server-only";
import { Types } from "mongoose";
import { NotificationLog, User, FollowUp, Meeting, Lead, Activity } from "@/models";
import type { NotificationChannel } from "@/models/NotificationLog";
import { sendEmail } from "@/lib/mailer";
import { renderNotificationEmailHtml } from "@/lib/emailTemplates";
import { sendWhatsApp } from "@/lib/whatsapp";
import { getSettingsWithSecrets } from "@/lib/settings";
import { formatDateTimeShort, formatTimeBadge } from "@/lib/utils";
import { dayRange } from "@/lib/time";
import { OPEN_STAGES, leadTitle } from "@/lib/sales";

type Id = Types.ObjectId | string;

/**
 * Notify one user. Always writes an in-app notification (the bell drawer);
 * also queues email / WhatsApp when the Super Admin has enabled those for
 * staff alerts on the Settings page (or `channels` forces them).
 *
 * `dedupeKey` makes it idempotent — the cron sweeps call this repeatedly and
 * a reminder with the same key is never sent twice.
 */
export async function notifyUser(input: {
  recipientId: Id;
  message: string;
  kind: string;
  leadId?: Id | null;
  dedupeKey?: string;
  channels?: NotificationChannel[];
}) {
  if (input.dedupeKey) {
    const exists = await NotificationLog.exists({ dedupeKey: input.dedupeKey, channel: "in_app" });
    if (exists) return false;
  }
  let channels = input.channels;
  if (!channels) {
    const settings = await getSettingsWithSecrets();
    channels = ["in_app"];
    if (settings?.sales?.alertEmail ?? true) channels.push("email");
    if (settings?.sales?.alertWhatsApp) channels.push("whatsapp");
  }
  for (const channel of channels) {
    const log = await NotificationLog.create({
      recipientId: input.recipientId,
      leadId: input.leadId ?? null,
      kind: input.kind,
      dedupeKey: input.dedupeKey ?? null,
      channel,
      message: input.message,
      status: channel === "in_app" ? "sent" : "queued",
    });
    if (channel !== "in_app") {
      dispatch(String(log._id)).catch((err) => console.error("[notifications] dispatch failed", err));
    }
  }
  return true;
}

const SUBJECTS: Record<string, string> = {
  leads_assigned: "New leads assigned",
  follow_up_due: "Follow-up due",
  follow_up_assigned: "Follow-up scheduled for you",
  meeting_upcoming: "Upcoming meeting",
  meeting_assigned: "Meeting booked for you",
  escalation: "Overdue follow-ups",
  morning_digest: "Your day in SalesPulse",
  daily_summary: "Daily sales summary",
  manager_alerts: "Leads needing attention",
};

async function dispatch(notificationId: string) {
  try {
    const log = await NotificationLog.findById(notificationId).lean();
    if (!log) return;
    const recipient = await User.findById(log.recipientId).select("name email phone").lean();
    if (!recipient) {
      await NotificationLog.findByIdAndUpdate(notificationId, { status: "failed", failureReason: "Recipient no longer exists" });
      return;
    }
    if (log.channel === "email") {
      const heading = SUBJECTS[log.kind] ?? "SalesPulse notification";
      await sendEmail({
        to: recipient.email,
        subject: `${heading} — SalesPulse`,
        text: log.message,
        html: renderNotificationEmailHtml({ heading, message: log.message }),
      });
    } else if (log.channel === "whatsapp") {
      if (!recipient.phone) {
        await NotificationLog.findByIdAndUpdate(notificationId, {
          status: "failed",
          failureReason: "No WhatsApp phone number on file for this user",
        });
        return;
      }
      await sendWhatsApp({ to: recipient.phone, message: log.message, name: recipient.name });
    }
    await NotificationLog.findByIdAndUpdate(notificationId, { status: "sent" });
  } catch (err) {
    await NotificationLog.findByIdAndUpdate(notificationId, {
      status: "failed",
      failureReason: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

async function managersFor(userId: Id): Promise<Id[]> {
  const u = await User.findById(userId).select("managerId").lean();
  if (u?.managerId) {
    const m = await User.findOne({ _id: u.managerId, isActive: true }).select("_id").lean();
    if (m) return [m._id];
  }
  const all = await User.find({ role: { $in: ["manager", "admin"] }, isActive: true }).select("_id").lean();
  return all.map((m) => m._id);
}

/**
 * Hourly sweep (POST /api/cron/hourly):
 *  - remind the assignee of follow-ups due in the next hour
 *  - remind the owner of meetings starting in the next 2 hours
 *  - escalate follow-ups overdue by more than `escalateAfterHours` to the assignee's manager
 */
export async function runHourlySweep() {
  const now = new Date();
  const settings = await getSettingsWithSecrets();
  const escalateAfter = settings?.sales?.escalateAfterHours ?? 24;
  let reminders = 0;
  let meetingReminders = 0;
  let escalations = 0;

  const dueSoon = await FollowUp.find({
    status: "Pending",
    reminderSentAt: null,
    dueAt: { $lte: new Date(now.getTime() + 60 * 60 * 1000) },
  })
    .populate("leadId", "companyName name phone")
    .lean();
  for (const fu of dueSoon) {
    const lead = fu.leadId as unknown as { _id: Id; companyName?: string; name: string; phone: string } | null;
    if (!lead) continue;
    const overdue = fu.dueAt < now;
    await notifyUser({
      recipientId: fu.assignedTo,
      leadId: lead._id,
      kind: "follow_up_due",
      dedupeKey: `fu-remind:${fu._id}:${fu.dueAt.toISOString()}`,
      message: `${overdue ? "Overdue" : "Due soon"}: ${leadTitle(lead)}${lead.companyName && lead.name ? ` (${lead.companyName})` : ""}, ${lead.phone} — "${fu.title}" at ${formatDateTimeShort(fu.dueAt)}.`,
    });
    await FollowUp.updateOne({ _id: fu._id }, { reminderSentAt: now });
    reminders += 1;
  }

  const meetingsSoon = await Meeting.find({
    status: "Scheduled",
    reminderSentAt: null,
    scheduledAt: { $gte: now, $lte: new Date(now.getTime() + 2 * 60 * 60 * 1000) },
  })
    .populate("leadId", "companyName name")
    .lean();
  for (const m of meetingsSoon) {
    const lead = m.leadId as unknown as { _id: Id; companyName?: string; name: string } | null;
    if (!lead) continue;
    await notifyUser({
      recipientId: m.ownerId,
      leadId: lead._id,
      kind: "meeting_upcoming",
      dedupeKey: `mt-remind:${m._id}:${m.scheduledAt.toISOString()}`,
      message: `Upcoming ${m.type.toLowerCase()} meeting with ${leadTitle(lead)} at ${formatTimeBadge(m.scheduledAt)}${m.location ? ` — ${m.location}` : ""}.`,
    });
    await Meeting.updateOne({ _id: m._id }, { reminderSentAt: now });
    meetingReminders += 1;
  }

  const toEscalate = await FollowUp.find({
    status: "Pending",
    escalatedAt: null,
    dueAt: { $lte: new Date(now.getTime() - escalateAfter * 60 * 60 * 1000) },
  })
    .populate("leadId", "companyName name")
    .populate("assignedTo", "name")
    .lean();
  // One message per manager, grouped — not one per follow-up.
  const byManager = new Map<string, string[]>();
  for (const fu of toEscalate) {
    const lead = fu.leadId as unknown as { companyName?: string; name: string } | null;
    const assignee = fu.assignedTo as unknown as { _id: Id; name: string } | null;
    if (!lead || !assignee) continue;
    for (const mId of await managersFor(assignee._id)) {
      const key = String(mId);
      if (key === String(assignee._id)) continue;
      const list = byManager.get(key) ?? [];
      list.push(`${leadTitle(lead)} (${assignee.name}, due ${formatDateTimeShort(fu.dueAt)})`);
      byManager.set(key, list);
    }
    await FollowUp.updateOne({ _id: fu._id }, { escalatedAt: now });
    escalations += 1;
  }
  for (const [managerId, items] of byManager) {
    await notifyUser({
      recipientId: managerId,
      kind: "escalation",
      message: `${items.length} follow-up${items.length === 1 ? " is" : "s are"} overdue by more than ${escalateAfter}h: ${items.slice(0, 5).join("; ")}${items.length > 5 ? `; +${items.length - 5} more` : ""}.`,
    });
  }

  return { reminders, meetingReminders, escalations };
}

/**
 * Morning sweep (POST /api/cron/morning): each telemarketer's day at a
 * glance, and a "needs attention" digest for managers — hot leads not
 * contacted, leads gone quiet, and assigned leads nobody has worked.
 */
export async function runMorningDigest() {
  const today = dayRange();
  const now = new Date();
  const settings = await getSettingsWithSecrets();
  const staleHours = settings?.sales?.staleLeadHours ?? 48;
  const staleBefore = new Date(now.getTime() - staleHours * 60 * 60 * 1000);
  let sent = 0;

  const agents = await User.find({ isActive: true, role: { $in: ["telemarketer", "manager"] } }).lean();
  for (const agent of agents) {
    const [dueToday, overdue, meetings, fresh] = await Promise.all([
      FollowUp.countDocuments({ assignedTo: agent._id, status: "Pending", dueAt: { $gte: today.start, $lt: today.end } }),
      FollowUp.countDocuments({ assignedTo: agent._id, status: "Pending", dueAt: { $lt: today.start } }),
      Meeting.countDocuments({ ownerId: agent._id, status: "Scheduled", scheduledAt: { $gte: today.start, $lt: today.end } }),
      Lead.countDocuments({ assignedTo: agent._id, stage: "New", doNotContact: false }),
    ]);
    if (!dueToday && !overdue && !meetings && !fresh) continue;
    const ok = await notifyUser({
      recipientId: agent._id,
      kind: "morning_digest",
      dedupeKey: `morning:${today.key}:${agent._id}`,
      message: `Good morning ${agent.name.split(" ")[0]} — today: ${dueToday} follow-up${dueToday === 1 ? "" : "s"} due${overdue ? `, ${overdue} overdue` : ""}, ${meetings} meeting${meetings === 1 ? "" : "s"}, ${fresh} new lead${fresh === 1 ? "" : "s"} to call. Target: ${agent.dailyCallTarget} calls.`,
    });
    if (ok) sent += 1;
  }

  const [hotUncontacted, stale, unworked] = await Promise.all([
    Lead.countDocuments({
      temperature: "Hot",
      stage: { $in: OPEN_STAGES },
      $or: [{ lastContactAt: null }, { lastContactAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } }],
    }),
    Lead.countDocuments({ stage: { $in: OPEN_STAGES.filter((s) => s !== "New") }, doNotContact: false, lastActivityAt: { $lt: staleBefore } }),
    Lead.countDocuments({ stage: "New", assignedTo: { $ne: null }, assignedAt: { $lt: staleBefore } }),
  ]);
  if (hotUncontacted || stale || unworked) {
    const managers = await User.find({ isActive: true, role: { $in: ["manager", "admin"] } }).select("_id").lean();
    for (const m of managers) {
      const ok = await notifyUser({
        recipientId: m._id,
        kind: "manager_alerts",
        dedupeKey: `mgr-alerts:${today.key}:${m._id}`,
        message: `Needs attention: ${hotUncontacted} hot lead${hotUncontacted === 1 ? "" : "s"} not contacted in 24h, ${stale} lead${stale === 1 ? "" : "s"} with no activity for ${staleHours}h+, ${unworked} assigned lead${unworked === 1 ? "" : "s"} never worked.`,
      });
      if (ok) sent += 1;
    }
  }
  return { sent };
}

/** Evening sweep (POST /api/cron/daily-summary): today's team numbers to every manager. */
export async function runDailySummary() {
  const today = dayRange();
  const calls = await Activity.find({ type: "call", createdAt: { $gte: today.start, $lt: today.end } })
    .select("outcome connected userId")
    .lean();
  const connected = calls.filter((c) => c.connected).length;
  const interested = calls.filter((c) => ["interested", "meeting_requested", "meeting_booked", "proposal_requested"].includes(c.outcome ?? "")).length;
  const meetings = calls.filter((c) => c.outcome === "meeting_booked").length;
  const converted = await Lead.countDocuments({ wonAt: { $gte: today.start, $lt: today.end } });
  const overdue = await FollowUp.countDocuments({ status: "Pending", dueAt: { $lt: new Date() } });
  const agents = new Set(calls.map((c) => String(c.userId))).size;

  const managers = await User.find({ isActive: true, role: { $in: ["manager", "admin"] } }).select("_id").lean();
  let sent = 0;
  for (const m of managers) {
    const ok = await notifyUser({
      recipientId: m._id,
      kind: "daily_summary",
      dedupeKey: `summary:${today.key}:${m._id}`,
      message: `Today (${today.key}): ${calls.length} calls by ${agents} telemarketer${agents === 1 ? "" : "s"}, ${connected} connected, ${interested} interested, ${meetings} meetings booked, ${converted} converted. ${overdue} follow-up${overdue === 1 ? "" : "s"} currently overdue.`,
    });
    if (ok) sent += 1;
  }
  return { sent, calls: calls.length };
}
