import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { findDuplicates } from "@/lib/duplicates";

export const dynamic = "force-dynamic";

/**
 * GET /api/leads/check-duplicate?phone=&company=&email=&excludeId=
 * Any signed-in user — a telemarketer who sourced a number needs to know
 * someone else already owns it, even though they can't open that lead.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const matches = await findDuplicates({
    phone: sp.get("phone") ?? undefined,
    companyName: sp.get("company") ?? undefined,
    email: sp.get("email") ?? undefined,
    excludeId: sp.get("excludeId") ?? undefined,
  });
  return ok(matches);
});
