import "server-only";
import { Types } from "mongoose";
import { Activity } from "@/models";
import type { ActivityMetrics } from "@/lib/types";

const INTERESTED_OUTCOMES = ["interested", "meeting_requested", "meeting_booked", "proposal_requested", "converted"];

export function emptyMetrics(): ActivityMetrics {
  return {
    callsAttempted: 0,
    connected: 0,
    noAnswer: 0,
    busy: 0,
    wrongNumber: 0,
    interested: 0,
    notInterested: 0,
    followUpsCreated: 0,
    followUpsCompleted: 0,
    meetingsBooked: 0,
    meetingsHeld: 0,
    demosCompleted: 0,
    proposalsRequested: 0,
    proposalsSent: 0,
    converted: 0,
  };
}

export function addMetrics(a: ActivityMetrics, b: ActivityMetrics): ActivityMetrics {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof ActivityMetrics)[]) out[k] = a[k] + b[k];
  return out;
}

function tally(m: ActivityMetrics, a: { type: string; outcome?: string | null; connected?: boolean; meta?: any }) {
  const meta = a.meta ?? {};
  if (a.type === "call") {
    m.callsAttempted++;
    if (a.connected) m.connected++;
    if (a.outcome === "no_answer") m.noAnswer++;
    if (a.outcome === "busy") m.busy++;
    if (a.outcome === "wrong_number") m.wrongNumber++;
    if (a.outcome && INTERESTED_OUTCOMES.includes(a.outcome)) m.interested++;
    if (a.outcome === "not_interested" || a.outcome === "do_not_contact") m.notInterested++;
    if (a.outcome === "proposal_requested") m.proposalsRequested++;
  } else if (a.type === "follow_up_created") m.followUpsCreated++;
  else if (a.type === "follow_up_completed") m.followUpsCompleted++;
  else if (a.type === "meeting_booked") m.meetingsBooked++;
  else if (a.type === "meeting_outcome") {
    m.meetingsHeld++;
    if (meta.outcome === "proposal_requested") m.proposalsRequested++;
  } else if (a.type === "stage_change") {
    if (meta.to === "Demo Completed") m.demosCompleted++;
    if (meta.to === "Won") m.converted++;
  } else if (a.type === "proposal_sent") m.proposalsSent++;
}

const COUNTED_TYPES = ["call", "follow_up_created", "follow_up_completed", "meeting_booked", "meeting_outcome", "stage_change", "proposal_sent"];

/**
 * Activity-derived metrics for a time range, grouped per user — every
 * number on the queue, dashboard and daily report comes from here, so
 * they always agree with each other.
 *
 * Deliberately a lean find() + in-process tally rather than a $group with
 * $cond: it only pulls four small fields per activity, stays fast at
 * telemarketing-team volumes (tens of thousands of activities a month),
 * and works on any MongoDB-compatible backend (Atlas, DocumentDB,
 * Cosmos DB, FerretDB) — several of which don't implement $cond in $group.
 */
export async function metricsByUser(params: { start: Date; end: Date; userIds?: (string | Types.ObjectId)[] }) {
  const match: Record<string, unknown> = { createdAt: { $gte: params.start, $lt: params.end }, type: { $in: COUNTED_TYPES } };
  if (params.userIds) match.userId = { $in: params.userIds.map((id) => new Types.ObjectId(String(id))) };

  const map = new Map<string, ActivityMetrics>();
  const cursor = Activity.find(match).select("userId type outcome connected meta.outcome meta.to").lean().cursor();
  for await (const a of cursor) {
    const key = String(a.userId);
    let m = map.get(key);
    if (!m) map.set(key, (m = emptyMetrics()));
    tally(m, a as any);
  }
  return map;
}

export async function metricsTotal(params: { start: Date; end: Date; userIds?: (string | Types.ObjectId)[] }) {
  const map = await metricsByUser(params);
  let total = emptyMetrics();
  for (const m of map.values()) total = addMetrics(total, m);
  return total;
}
