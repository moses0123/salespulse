import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { parseRange, dayKey } from "@/lib/time";
import { buildReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** GET /api/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD&userId= — automatically generated activity report. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const { start, end } = parseRange(sp.get("from"), sp.get("to"));
  const report = await buildReport(user!, start, end, sp.get("userId"));
  return ok({ date: dayKey(start), from: start.toISOString(), to: end.toISOString(), ...report });
});
