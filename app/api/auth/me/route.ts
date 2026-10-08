import connectDB from "@/lib/db";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/auth/me — the currently signed-in user, or 401. */
export const GET = withErrorHandling(async () => {
  await connectDB();
  const user = await getSessionUser();
  if (!user) return fail("Unauthorized", 401);
  return ok(user);
});
