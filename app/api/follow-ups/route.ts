import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { FollowUp } from "@/models";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { isManager } from "@/lib/scope";
import { dayRange } from "@/lib/time";
import { FOLLOW_UP_POPULATE, serializeFollowUps } from "@/lib/serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/follow-ups?view=overdue|today|upcoming|completed&userId=
 * Telemarketers see their own; managers see everyone's (or one person's with ?userId=).
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "today";
  const filter: Record<string, unknown> = {};
  if (!isManager(user)) filter.assignedTo = user!._id;
  else if (sp.get("userId")) filter.assignedTo = sp.get("userId");

  const today = dayRange();
  const now = new Date();
  let sort: Record<string, 1 | -1> = { dueAt: 1 };
  if (view === "overdue") Object.assign(filter, { status: "Pending", dueAt: { $lt: now } });
  else if (view === "today") Object.assign(filter, { status: "Pending", dueAt: { $gte: now, $lt: today.end } });
  else if (view === "upcoming") Object.assign(filter, { status: "Pending", dueAt: { $gte: today.end } });
  else {
    Object.assign(filter, { status: { $in: ["Completed", "Cancelled"] } });
    sort = { completedAt: -1, updatedAt: -1 };
  }

  const [items, counts] = await Promise.all([
    FollowUp.find(filter).sort(sort).limit(300).populate(FOLLOW_UP_POPULATE).lean(),
    (async () => {
      const base: Record<string, unknown> = { status: "Pending" };
      if (filter.assignedTo) base.assignedTo = filter.assignedTo;
      const [overdue, todayN, upcoming] = await Promise.all([
        FollowUp.countDocuments({ ...base, dueAt: { $lt: now } }),
        FollowUp.countDocuments({ ...base, dueAt: { $gte: now, $lt: today.end } }),
        FollowUp.countDocuments({ ...base, dueAt: { $gte: today.end } }),
      ]);
      return { overdue, today: todayN, upcoming };
    })(),
  ]);
  return ok({ items: serializeFollowUps(items), counts });
});
