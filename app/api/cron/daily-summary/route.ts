import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { authorizeCron } from "@/lib/cron";
import { runDailySummary } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/** POST /api/cron/daily-summary — Today's team numbers to every manager. Run once, end of day. Auth: Bearer CRON_SECRET (or a signed-in Super Admin). */
export const POST = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const denied = await authorizeCron(req);
  if (denied) return denied;
  return ok(await runDailySummary());
});

/** GET is accepted too, for schedulers (e.g. Vercel Cron) that only send GET requests. */
export const GET = POST;
