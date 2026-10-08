import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { Meeting } from "@/models";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { isManager } from "@/lib/scope";
import { MEETING_POPULATE, serializeMeetings } from "@/lib/serializers";

export const dynamic = "force-dynamic";

/**
 * GET /api/meetings?view=upcoming|needs_outcome|past&userId=
 * "needs_outcome" = scheduled meetings whose time has passed with no outcome recorded.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view") ?? "upcoming";
  const now = new Date();
  const base: Record<string, unknown> = {};
  if (!isManager(user)) base.ownerId = user!._id;
  else if (sp.get("userId")) base.ownerId = sp.get("userId");

  const filter: Record<string, unknown> = { ...base };
  let sort: Record<string, 1 | -1> = { scheduledAt: 1 };
  if (view === "upcoming") Object.assign(filter, { status: "Scheduled", scheduledAt: { $gte: now } });
  else if (view === "needs_outcome") Object.assign(filter, { status: "Scheduled", scheduledAt: { $lt: now } });
  else {
    Object.assign(filter, { status: { $in: ["Completed", "Cancelled"] } });
    sort = { scheduledAt: -1 };
  }
  const [items, upcoming, needsOutcome] = await Promise.all([
    Meeting.find(filter).sort(sort).limit(300).populate(MEETING_POPULATE).lean(),
    Meeting.countDocuments({ ...base, status: "Scheduled", scheduledAt: { $gte: now } }),
    Meeting.countDocuments({ ...base, status: "Scheduled", scheduledAt: { $lt: now } }),
  ]);
  return ok({ items: serializeMeetings(items), counts: { upcoming, needsOutcome } });
});
