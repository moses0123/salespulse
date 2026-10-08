import connectDB from "@/lib/db";
import { NotificationLog } from "@/models";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** POST /api/notifications/read — mark all the caller's in-app notifications read. */
export const POST = withErrorHandling(async () => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  await NotificationLog.updateMany({ recipientId: user!._id, channel: "in_app", readAt: null }, { readAt: new Date() });
  return ok({ done: true });
});
