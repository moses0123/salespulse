import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { Lead, User, FollowUp, Meeting, Activity, Product } from "@/models";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireRole } from "@/lib/auth";
import { parseRange } from "@/lib/time";
import { metricsByUser, emptyMetrics, addMetrics } from "@/lib/metrics";
import { LEAD_STAGES, OPEN_STAGES, rate, type LeadStage } from "@/lib/sales";
import { getSettingsWithSecrets } from "@/lib/settings";
import { LEAD_POPULATE, FOLLOW_UP_POPULATE, serializeLeads, serializeFollowUps } from "@/lib/serializers";
import type { BreakdownRow, TeamRow } from "@/lib/types";

export const dynamic = "force-dynamic";

const INTERESTED_PLUS = LEAD_STAGES.slice(LEAD_STAGES.indexOf("Interested"), LEAD_STAGES.indexOf("Won") + 1);

type LeadLite = { _id: unknown; productId?: unknown; industry?: string; source?: string; stage: LeadStage; dealValue?: number | null };

/** Group the lead book by product / industry / source (in-process; portable across MongoDB-compatible backends). */
function breakdown(leads: LeadLite[], field: "productId" | "industry" | "source", meetingLeadIds: Set<string>, productNames: Map<string, string>): BreakdownRow[] {
  const groups = new Map<string, BreakdownRow>();
  for (const l of leads) {
    const raw = l[field];
    const key =
      field === "productId" ? (raw ? productNames.get(String(raw)) ?? "Unknown" : "No product") : (raw as string) || "Not set";
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, leads: 0, interested: 0, meetings: 0, won: 0, pipelineValue: 0 }));
    g.leads++;
    if ((INTERESTED_PLUS as readonly string[]).includes(l.stage)) g.interested++;
    if (l.stage === "Won") g.won++;
    if (OPEN_STAGES.includes(l.stage)) g.pipelineValue += l.dealValue ?? 0;
    if (meetingLeadIds.has(String(l._id))) g.meetings++;
  }
  return [...groups.values()].sort((a, b) => b.leads - a.leads).slice(0, 15);
}

/** GET /api/dashboard?from=&to= — Admin/Manager real-time management view (§16, §22). */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireRole(user, ["admin", "manager"]);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const { start, end } = parseRange(sp.get("from"), sp.get("to"));
  const now = new Date();
  const settings = await getSettingsWithSecrets();
  const staleBefore = new Date(now.getTime() - (settings?.sales?.staleLeadHours ?? 48) * 3600_000);

  const [byUser, users, totalLeads, openLeads, newLeadsInRange, overdueFollowUps, staleLeads, unassignedLeads, allLeads, leadsPerUser, overduePerUser, meetingLeadIdsRaw, staleSample, overdueSample, activityCount] =
    await Promise.all([
      metricsByUser({ start, end }),
      User.find({ isActive: true, role: { $in: ["telemarketer", "manager"] } }).select("name role").sort({ name: 1 }).lean(),
      Lead.countDocuments({}),
      Lead.countDocuments({ stage: { $in: OPEN_STAGES } }),
      Lead.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      FollowUp.countDocuments({ status: "Pending", dueAt: { $lt: now } }),
      Lead.countDocuments({ stage: { $in: OPEN_STAGES }, doNotContact: false, lastActivityAt: { $lt: staleBefore } }),
      Lead.countDocuments({ assignedTo: null, stage: { $in: OPEN_STAGES } }),
      Lead.find({}).select("productId industry source stage dealValue").lean<LeadLite[]>(),
      Lead.aggregate([{ $match: { stage: { $in: OPEN_STAGES }, assignedTo: { $ne: null } } }, { $group: { _id: "$assignedTo", n: { $sum: 1 } } }]),
      FollowUp.aggregate([{ $match: { status: "Pending", dueAt: { $lt: now } } }, { $group: { _id: "$assignedTo", n: { $sum: 1 } } }]),
      Meeting.distinct("leadId"),
      Lead.find({ stage: { $in: OPEN_STAGES }, doNotContact: false, lastActivityAt: { $lt: staleBefore } }).sort({ lastActivityAt: 1 }).limit(8).populate(LEAD_POPULATE).lean(),
      FollowUp.find({ status: "Pending", dueAt: { $lt: now } }).sort({ dueAt: 1 }).limit(8).populate(FOLLOW_UP_POPULATE).lean(),
      Activity.countDocuments({ type: { $in: ["call", "whatsapp", "email", "meeting_outcome"] } }),
    ]);

  let totals = emptyMetrics();
  for (const m of byUser.values()) totals = addMetrics(totals, m);

  const leadsMap = new Map(leadsPerUser.map((r) => [String(r._id), r.n as number]));
  const overdueMap = new Map(overduePerUser.map((r) => [String(r._id), r.n as number]));
  const team: TeamRow[] = users
    .map((u) => {
      const m = byUser.get(String(u._id)) ?? emptyMetrics();
      return {
        ...m,
        user: { _id: String(u._id), name: u.name, role: u.role },
        leadsAssigned: leadsMap.get(String(u._id)) ?? 0,
        overdueFollowUps: overdueMap.get(String(u._id)) ?? 0,
        contactRate: rate(m.connected, m.callsAttempted),
        interestRate: rate(m.interested, m.connected),
        meetingRate: rate(m.meetingsBooked, m.connected),
      };
    })
    .filter((r) => r.user.role === "telemarketer" || r.callsAttempted > 0 || r.leadsAssigned > 0)
    .sort((a, b) => b.callsAttempted - a.callsAttempted);

  const byStage = LEAD_STAGES.map((stage) => ({ stage, count: 0, value: 0 }));
  for (const l of allLeads) {
    const row = byStage[LEAD_STAGES.indexOf(l.stage)];
    if (!row) continue;
    row.count++;
    row.value += l.dealValue ?? 0;
  }
  const pipelineValue = byStage.filter((s) => OPEN_STAGES.includes(s.stage)).reduce((a, s) => a + s.value, 0);
  const wonTotal = byStage.find((s) => s.stage === "Won")!.count;

  const meetingLeadIds = new Set(meetingLeadIdsRaw.map(String));
  const products = await Product.find({}).select("name").lean();
  const productNames = new Map(products.map((p) => [String(p._id), p.name]));
  const byProduct = breakdown(allLeads, "productId", meetingLeadIds, productNames);
  const byIndustry = breakdown(allLeads, "industry", meetingLeadIds, productNames);
  const bySource = breakdown(allLeads, "source", meetingLeadIds, productNames);

  return ok({
    range: { from: start.toISOString(), to: end.toISOString() },
    totals: { ...totals, totalLeads, openLeads, newLeadsInRange, overdueFollowUps, staleLeads, unassignedLeads, pipelineValue },
    funnel: [
      { label: "Calls attempted", value: totals.callsAttempted },
      { label: "Connected", value: totals.connected },
      { label: "Interested", value: totals.interested },
      { label: "Meetings booked", value: totals.meetingsBooked },
      { label: "Proposals", value: totals.proposalsRequested },
      { label: "Customers", value: totals.converted },
    ],
    rates: {
      contactRate: rate(totals.connected, totals.callsAttempted),
      interestRate: rate(totals.interested, totals.connected),
      meetingConversion: rate(totals.meetingsBooked, totals.connected),
      proposalConversion: rate(totals.proposalsRequested, totals.meetingsHeld || totals.meetingsBooked),
      customerConversion: rate(totals.converted, totals.proposalsRequested),
      leadToCustomer: rate(wonTotal, totalLeads),
      activitiesPerConversion: wonTotal ? Math.round((activityCount / wonTotal) * 10) / 10 : null,
    },
    team,
    byStage,
    byProduct,
    byIndustry,
    bySource,
    staleSample: serializeLeads(staleSample),
    overdueSample: serializeFollowUps(overdueSample),
  });
});
