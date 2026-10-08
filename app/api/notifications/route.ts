import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { NotificationLog } from "@/models";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/notifications?countOnly=1 — the caller's in-app notifications (+ unread count). */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const unread = await NotificationLog.countDocuments({ recipientId: user!._id, channel: "in_app", readAt: null });
  if (req.nextUrl.searchParams.get("countOnly") === "1") return ok({ unread });
  const items = await NotificationLog.find({ recipientId: user!._id, channel: "in_app" }).sort({ createdAt: -1 }).limit(60).lean();
  return ok({ unread, items });
});
