import "server-only";
import { Types } from "mongoose";
import { Lead, Activity, FollowUp, Meeting, Product } from "@/models";
import type { ILead } from "@/models/Lead";
import type { IUser } from "@/models/User";
import type { ActivityType } from "@/models/Activity";
import type { FollowUpChannel } from "@/models/FollowUp";
import type { MeetingType } from "@/models/Meeting";
import {
  OUTCOME_RULES,
  MEETING_OUTCOME_RULES,
  advanceStage,
  computeScore,
  clampScore,
  temperatureForScore,
  type CallOutcome,
  type MeetingOutcome,
  type LeadStage,
  type Temperature,
  leadTitle,
} from "@/lib/sales";
import { notifyUser } from "@/lib/notifications";
import { formatDateTimeShort } from "@/lib/utils";

type Id = Types.ObjectId | string;

export async function addActivity(input: {
  leadId: Id;
  userId: Id;
  type: ActivityType;
  summary: string;
  notes?: string;
  outcome?: CallOutcome | null;
  connected?: boolean;
  productId?: Id | null;
  meta?: Record<string, unknown>;
}) {
  const activity = await Activity.create({
    leadId: input.leadId,
    userId: input.userId,
    type: input.type,
    summary: input.summary,
    notes: input.notes ?? "",
    outcome: input.outcome ?? null,
    connected: input.connected ?? false,
    productId: input.productId ?? null,
    meta: input.meta ?? {},
  });
  await Lead.updateOne({ _id: input.leadId }, { lastActivityAt: new Date() });
  return activity;
}

/**
 * Recompute a lead's denormalised "next action" from its earliest pending
 * follow-up and earliest upcoming scheduled meeting. Called after anything
 * that creates, completes or moves either.
 */
export async function refreshNextAction(leadId: Id) {
  const [fu, mt] = await Promise.all([
    FollowUp.findOne({ leadId, status: "Pending" }).sort({ dueAt: 1 }).lean(),
    Meeting.findOne({ leadId, status: "Scheduled" }).sort({ scheduledAt: 1 }).lean(),
  ]);
  let next: { at: Date; type: "follow_up" | "meeting"; title: string } | null = null;
  if (fu) next = { at: fu.dueAt, type: "follow_up", title: fu.title };
  if (mt && (!next || mt.scheduledAt < next.at)) next = { at: mt.scheduledAt, type: "meeting", title: `${mt.type} meeting` };
  await Lead.updateOne(
    { _id: leadId },
    next
      ? { nextActionAt: next.at, nextActionType: next.type, nextActionTitle: next.title }
      : { nextActionAt: null, nextActionType: null, nextActionTitle: null }
  );
}

/** Close every pending follow-up on a lead (a new call/next action supersedes them). */
async function supersedePendingFollowUps(leadId: Id, userId: Id, note: string, exceptId?: Id | null) {
  const filter: Record<string, unknown> = { leadId, status: "Pending" };
  if (exceptId) filter._id = { $ne: exceptId };
  await FollowUp.updateMany(filter, {
    status: "Completed",
    completedAt: new Date(),
    completedBy: userId,
    completionNote: note,
  });
}

export async function createFollowUp(input: {
  lead: Pick<ILead, "_id" | "name" | "companyName" | "assignedTo">;
  actor: IUser;
  title: string;
  dueAt: Date;
  channel?: FollowUpChannel;
  assignedTo?: Id | null;
  notifyAssignee?: boolean;
}) {
  const assignee = input.assignedTo ?? input.lead.assignedTo ?? input.actor._id;
  const fu = await FollowUp.create({
    leadId: input.lead._id,
    assignedTo: assignee,
    createdBy: input.actor._id,
    title: input.title,
    channel: input.channel ?? "call",
    dueAt: input.dueAt,
  });
  await addActivity({
    leadId: input.lead._id,
    userId: input.actor._id,
    type: "follow_up_created",
    summary: `Follow-up scheduled: ${input.title} — ${formatDateTimeShort(input.dueAt)}`,
    meta: { followUpId: String(fu._id), dueAt: input.dueAt.toISOString(), channel: fu.channel },
  });
  if (input.notifyAssignee && String(assignee) !== String(input.actor._id)) {
    await notifyUser({
      recipientId: assignee,
      leadId: input.lead._id,
      kind: "follow_up_assigned",
      message: `${input.actor.name} scheduled a follow-up for you: ${leadTitle(input.lead)} — "${input.title}" on ${formatDateTimeShort(input.dueAt)}.`,
    });
  }
  return fu;
}

export async function bookMeeting(input: {
  lead: Pick<ILead, "_id" | "name" | "companyName" | "assignedTo">;
  actor: IUser;
  scheduledAt: Date;
  type?: MeetingType;
  durationMins?: number;
  location?: string;
  agenda?: string;
  productId?: Id | null;
  ownerId?: Id | null;
}) {
  const owner = input.ownerId ?? input.lead.assignedTo ?? input.actor._id;
  const meeting = await Meeting.create({
    leadId: input.lead._id,
    ownerId: owner,
    createdBy: input.actor._id,
    type: input.type ?? "Demo",
    scheduledAt: input.scheduledAt,
    durationMins: input.durationMins ?? 60,
    location: input.location ?? "",
    agenda: input.agenda ?? "",
    productId: input.productId ?? null,
  });
  await addActivity({
    leadId: input.lead._id,
    userId: input.actor._id,
    type: "meeting_booked",
    summary: `${meeting.type} meeting booked — ${formatDateTimeShort(input.scheduledAt)}`,
    productId: input.productId ?? null,
    meta: { meetingId: String(meeting._id), location: meeting.location },
  });
  if (String(owner) !== String(input.actor._id)) {
    await notifyUser({
      recipientId: owner,
      leadId: input.lead._id,
      kind: "meeting_assigned",
      message: `${input.actor.name} booked a ${meeting.type.toLowerCase()} meeting for you with ${leadTitle(input.lead)} on ${formatDateTimeShort(input.scheduledAt)}.`,
    });
  }
  return meeting;
}

async function setStage(lead: ILead, next: LeadStage, actor: IUser, reason?: string) {
  if (lead.stage === next) return;
  const update: Partial<ILead> = { stage: next };
  if (next === "Won") update.wonAt = new Date();
  if (next === "Lost") update.lostAt = new Date();
  await Lead.updateOne({ _id: lead._id }, update);
  await addActivity({
    leadId: lead._id,
    userId: actor._id,
    type: "stage_change",
    summary: `Stage: ${lead.stage} → ${next}${reason ? ` (${reason})` : ""}`,
    meta: { from: lead.stage, to: next },
  });
  lead.stage = next;
}

export interface LogCallInput {
  outcome: CallOutcome;
  notes?: string;
  productId?: string | null;
  temperature?: Temperature | null;
  needIdentified?: boolean;
  askedPricing?: boolean;
  dealValue?: number | null;
  /** The follow-up this call was made from, if any. */
  followUpId?: string | null;
  nextAction?: { title: string; dueAt: Date; channel?: FollowUpChannel } | null;
  meeting?: { scheduledAt: Date; type?: MeetingType; durationMins?: number; location?: string; agenda?: string } | null;
}

/**
 * The heart of the system: "make the call → capture the outcome → create
 * the next action → update management". One call writes the activity,
 * moves the pipeline, rescores the lead, closes whatever follow-up it
 * satisfied and opens the next one — so the lead always has a clear status
 * and (where needed) a clear next action with an owner and a due date.
 */
export async function logCall(lead: ILead, actor: IUser, input: LogCallInput) {
  const rule = OUTCOME_RULES[input.outcome];

  const productId = input.productId ?? (lead.productId ? String(lead.productId) : null);
  let productName: string | undefined;
  if (productId) productName = (await Product.findById(productId).select("name").lean())?.name;

  const outcomeBits = [rule.label];
  if (productName && rule.captureInterest) outcomeBits.push(`in ${productName}`);
  const activity = await addActivity({
    leadId: lead._id,
    userId: actor._id,
    type: "call",
    outcome: input.outcome,
    connected: rule.connected,
    summary: `Outbound call — ${outcomeBits.join(" ")}`,
    notes: input.notes,
    productId,
    meta: {
      temperature: input.temperature ?? null,
      needIdentified: !!input.needIdentified,
      askedPricing: !!input.askedPricing,
      followUpId: input.followUpId ?? null,
    },
  });

  // Score + temperature.
  const score = computeScore({
    current: lead.score,
    outcome: input.outcome,
    needIdentified: input.needIdentified,
    askedPricing: input.askedPricing,
  });
  const temperature = rule.captureInterest && input.temperature ? input.temperature : temperatureForScore(score);

  const update: Record<string, unknown> = {
    score,
    temperature,
    lastOutcome: input.outcome,
    lastContactAt: new Date(),
    $inc: { callCount: 1 },
  };
  if (productId) update.productId = productId;
  if (input.dealValue != null) update.dealValue = input.dealValue;
  if (input.outcome === "wrong_number") update.phoneValid = false;
  if (input.outcome === "do_not_contact") update.doNotContact = true;
  if (input.outcome === "not_interested") update.lostReason = "Not interested";
  if (input.outcome === "do_not_contact") update.lostReason = "Do not contact";
  await Lead.updateOne({ _id: lead._id }, update);
  lead.score = score;

  // Pipeline.
  await setStage(lead, advanceStage(lead.stage, rule.stage), actor);

  // The follow-up this call came from (and any other open ones) are done.
  if (input.followUpId) {
    await FollowUp.updateOne(
      { _id: input.followUpId, leadId: lead._id, status: "Pending" },
      { status: "Completed", completedAt: new Date(), completedBy: actor._id, completionNote: `Call — ${rule.label}` }
    );
    await addActivity({
      leadId: lead._id,
      userId: actor._id,
      type: "follow_up_completed",
      summary: `Follow-up completed by call — ${rule.label}`,
      meta: { followUpId: input.followUpId },
    });
  }
  await supersedePendingFollowUps(lead._id, actor._id, `Superseded by call — ${rule.label}`);

  // Next action.
  let followUp = null;
  let meeting = null;
  if (rule.nextAction === "meeting" && input.meeting) {
    meeting = await bookMeeting({ lead, actor, productId, ...input.meeting });
  } else if (input.nextAction && rule.stage !== "Lost") {
    // Required for open outcomes; optional (e.g. an onboarding call) after a conversion.
    followUp = await createFollowUp({ lead, actor, ...input.nextAction });
  }
  // A lost/DNC lead's scheduled meetings are cancelled too.
  if (rule.stage === "Lost") {
    await Meeting.updateMany({ leadId: lead._id, status: "Scheduled" }, { status: "Cancelled" });
  }
  await refreshNextAction(lead._id);

  return { activity, followUp, meeting };
}

export interface MeetingOutcomeInput {
  outcome: MeetingOutcome;
  notes?: string;
  dealValue?: number | null;
  nextAction?: { title: string; dueAt: Date; channel?: FollowUpChannel } | null;
  rescheduleTo?: Date | null;
}

export async function recordMeetingOutcome(meetingId: Id, actor: IUser, input: MeetingOutcomeInput) {
  const meeting = await Meeting.findById(meetingId);
  if (!meeting) throw new Error("Meeting not found");
  const lead = await Lead.findById(meeting.leadId);
  if (!lead) throw new Error("Lead not found");
  const rule = MEETING_OUTCOME_RULES[input.outcome];

  if (input.outcome === "reschedule") {
    if (!input.rescheduleTo) throw new Error("A new date/time is required to reschedule");
    const from = meeting.scheduledAt;
    meeting.scheduledAt = input.rescheduleTo;
    meeting.rescheduleCount += 1;
    meeting.reminderSentAt = null;
    await meeting.save();
    await addActivity({
      leadId: lead._id,
      userId: actor._id,
      type: "meeting_rescheduled",
      summary: `Meeting rescheduled: ${formatDateTimeShort(from)} → ${formatDateTimeShort(input.rescheduleTo)}`,
      notes: input.notes,
      meta: { meetingId: String(meeting._id) },
    });
    await refreshNextAction(lead._id);
    return meeting;
  }

  meeting.status = "Completed";
  meeting.outcome = input.outcome;
  meeting.outcomeNotes = input.notes ?? "";
  meeting.outcomeAt = new Date();
  await meeting.save();

  await addActivity({
    leadId: lead._id,
    userId: actor._id,
    type: "meeting_outcome",
    summary: `Meeting — ${rule.label}`,
    notes: input.notes,
    meta: { meetingId: String(meeting._id), outcome: input.outcome },
  });

  const score = input.outcome === "converted" ? 100 : clampScore(lead.score + rule.score);
  const update: Record<string, unknown> = { score, temperature: temperatureForScore(score) };
  if (input.dealValue != null) update.dealValue = input.dealValue;
  if (input.outcome === "not_interested") update.lostReason = "Not interested (after meeting)";
  await Lead.updateOne({ _id: lead._id }, update);

  if (rule.stage) {
    const leadObj = lead.toObject() as ILead;
    await setStage(leadObj, advanceStage(leadObj.stage, rule.stage), actor);
  }

  await supersedePendingFollowUps(lead._id, actor._id, `Superseded by meeting outcome — ${rule.label}`);
  if (input.nextAction && rule.nextAction === "required") {
    await createFollowUp({ lead, actor, ...input.nextAction });
  }
  await refreshNextAction(lead._id);
  return meeting;
}

/** Manual stage move (pipeline board / lead drawer). */
export async function changeStage(lead: ILead, actor: IUser, stage: LeadStage, opts: { lostReason?: string; dealValue?: number | null } = {}) {
  const update: Record<string, unknown> = {};
  if (stage === "Lost") update.lostReason = opts.lostReason || lead.lostReason || "Lost";
  if (opts.dealValue != null) update.dealValue = opts.dealValue;
  if (stage === "Won") Object.assign(update, { score: 100, temperature: "Hot" });
  if (Object.keys(update).length) await Lead.updateOne({ _id: lead._id }, update);
  const isProposal = stage === "Proposal Sent" && lead.stage !== "Proposal Sent";
  await setStage(lead, stage, actor, stage === "Lost" ? opts.lostReason : undefined);
  if (isProposal) {
    await addActivity({ leadId: lead._id, userId: actor._id, type: "proposal_sent", summary: "Proposal sent" });
  }
  if (stage === "Lost" || stage === "Won") {
    await FollowUp.updateMany({ leadId: lead._id, status: "Pending" }, { status: "Cancelled" });
    if (stage === "Lost") await Meeting.updateMany({ leadId: lead._id, status: "Scheduled" }, { status: "Cancelled" });
    await refreshNextAction(lead._id);
  }
}

/** Assign leads to a user, logging and notifying. */
export async function assignLeads(leadIds: Id[], toUserId: Id | null, actor: IUser, toUserName?: string) {
  if (!leadIds.length) return 0;
  const leads = await Lead.find({ _id: { $in: leadIds } }).select("assignedTo name companyName").lean();
  const changing = leads.filter((l) => String(l.assignedTo ?? "") !== String(toUserId ?? ""));
  if (!changing.length) return 0;
  const ids = changing.map((l) => l._id);
  await Lead.updateMany({ _id: { $in: ids } }, { assignedTo: toUserId, assignedAt: toUserId ? new Date() : null });
  // Open follow-ups/meetings move with the lead.
  if (toUserId) {
    await FollowUp.updateMany({ leadId: { $in: ids }, status: "Pending" }, { assignedTo: toUserId });
    await Meeting.updateMany({ leadId: { $in: ids }, status: "Scheduled" }, { ownerId: toUserId });
  }
  await Activity.insertMany(
    ids.map((id) => ({
      leadId: id,
      userId: actor._id,
      type: "assigned",
      summary: toUserId ? `Assigned to ${toUserName ?? "telemarketer"}` : "Unassigned",
    }))
  );
  await Lead.updateMany({ _id: { $in: ids } }, { lastActivityAt: new Date() });
  if (toUserId && String(toUserId) !== String(actor._id)) {
    const first = leadTitle(changing[0]);
    await notifyUser({
      recipientId: toUserId,
      kind: "leads_assigned",
      message:
        changing.length === 1
          ? `${actor.name} assigned you a new lead: ${first}.`
          : `${actor.name} assigned you ${changing.length} new leads (incl. ${first}). They're in your daily queue.`,
    });
  }
  return changing.length;
}
