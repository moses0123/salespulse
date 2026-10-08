import "server-only";
import { Types } from "mongoose";
import { Lead, User } from "@/models";
import type { IUser } from "@/models/User";
import { OPEN_STAGES } from "@/lib/sales";
import { assignLeads } from "@/lib/leadService";

export type AssignMode = "user" | "round_robin" | "least_loaded";

/**
 * Distribute leads across telemarketers (§20 MVP subset):
 *  - user          → all to one person
 *  - round_robin   → evenly, in turn
 *  - least_loaded  → each lead to whoever currently has the fewest open leads
 */
export async function distributeLeads(leadIds: (string | Types.ObjectId)[], mode: AssignMode, userIds: string[], actor: IUser) {
  const users = await User.find({ _id: { $in: userIds }, isActive: true }).select("name").lean();
  if (!users.length) throw new Error("Pick at least one active user to assign to");

  const buckets = new Map<string, (string | Types.ObjectId)[]>();
  users.forEach((u) => buckets.set(String(u._id), []));

  if (mode === "user") {
    buckets.set(String(users[0]._id), [...leadIds]);
  } else if (mode === "round_robin") {
    leadIds.forEach((id, i) => buckets.get(String(users[i % users.length]._id))!.push(id));
  } else {
    const counts = await Lead.aggregate([
      { $match: { assignedTo: { $in: users.map((u) => u._id) }, stage: { $in: OPEN_STAGES } } },
      { $group: { _id: "$assignedTo", n: { $sum: 1 } } },
    ]);
    const load = new Map<string, number>(users.map((u) => [String(u._id), 0]));
    counts.forEach((c) => load.set(String(c._id), c.n));
    for (const id of leadIds) {
      let best = String(users[0]._id);
      for (const [uid, n] of load) if (n < load.get(best)!) best = uid;
      buckets.get(best)!.push(id);
      load.set(best, load.get(best)! + 1);
    }
  }

  const result: { userId: string; name: string; count: number }[] = [];
  for (const u of users) {
    const ids = buckets.get(String(u._id))!;
    const n = await assignLeads(ids, u._id, actor, u.name);
    result.push({ userId: String(u._id), name: u.name, count: n });
  }
  return result;
}
