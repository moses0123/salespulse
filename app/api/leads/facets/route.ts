import connectDB from "@/lib/db";
import { Lead } from "@/models";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/leads/facets — distinct industries/locations for filter dropdowns and form suggestions. */
export const GET = withErrorHandling(async () => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const [industries, locations] = await Promise.all([Lead.distinct("industry"), Lead.distinct("location")]);
  const clean = (arr: unknown[]) => (arr as string[]).filter(Boolean).sort((a, b) => a.localeCompare(b));
  return ok({ industries: clean(industries), locations: clean(locations) });
});
