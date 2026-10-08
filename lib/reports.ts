import "server-only";
import { User, Lead, DailyNote } from "@/models";
import type { IUser } from "@/models/User";
import { metricsByUser, emptyMetrics, addMetrics } from "@/lib/metrics";
import { OPEN_STAGES } from "@/lib/sales";
import { isManager } from "@/lib/scope";
import { dayKey } from "@/lib/time";

/** Per-person activity report for a range (§15). Telemarketers only ever get their own row. */
export async function buildReport(viewer: IUser, start: Date, end: Date, userId?: string | null) {
  const userFilter: Record<string, unknown> = { isActive: true, role: { $in: ["telemarketer", "manager"] } };
  if (!isManager(viewer)) userFilter._id = viewer._id;
  else if (userId) userFilter._id = userId;
  const users = await User.find(userFilter).select("name role").sort({ name: 1 }).lean();
  const ids = users.map((u) => u._id);

  const [byUser, leadCounts, notes] = await Promise.all([
    metricsByUser({ start, end, userIds: ids }),
    Lead.aggregate([{ $match: { assignedTo: { $in: ids }, stage: { $in: OPEN_STAGES } } }, { $group: { _id: "$assignedTo", n: { $sum: 1 } } }]),
    DailyNote.find({ userId: { $in: ids }, date: { $gte: dayKey(start), $lte: dayKey(new Date(end.getTime() - 1)) } }).lean(),
  ]);
  const leadMap = new Map(leadCounts.map((r) => [String(r._id), r.n as number]));
  const singleDay = dayKey(start) === dayKey(new Date(end.getTime() - 1));
  const notesByUser = new Map<string, string[]>();
  for (const n of notes) {
    if (!n.comment) continue;
    const list = notesByUser.get(String(n.userId)) ?? [];
    list.push(singleDay ? n.comment : `${n.date}: ${n.comment}`);
    notesByUser.set(String(n.userId), list);
  }

  const rows = users
    .map((u) => ({
      ...(byUser.get(String(u._id)) ?? emptyMetrics()),
      user: { _id: String(u._id), name: u.name, role: u.role },
      leadsAssigned: leadMap.get(String(u._id)) ?? 0,
      comment: (notesByUser.get(String(u._id)) ?? []).join("\n"),
    }))
    .filter((r) => r.user.role === "telemarketer" || r.callsAttempted > 0 || String(r.user._id) === String(viewer._id));

  let totals = { ...emptyMetrics(), leadsAssigned: 0 };
  for (const r of rows) totals = { ...addMetrics(totals, r), leadsAssigned: totals.leadsAssigned + r.leadsAssigned };
  return { rows, totals };
}
