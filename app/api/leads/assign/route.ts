import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireRole } from "@/lib/auth";
import { distributeLeads } from "@/lib/assignment";
import { assignLeads } from "@/lib/leadService";

export const dynamic = "force-dynamic";

const schema = z.object({
  leadIds: z.array(z.string()).min(1).max(5000),
  mode: z.enum(["user", "round_robin", "least_loaded", "unassign"]),
  userIds: z.array(z.string()).optional(),
});

/** POST /api/leads/assign — Admin/Manager bulk (re)assignment. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireRole(user, ["admin", "manager"]);
  if (denied) return denied;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const { leadIds, mode, userIds } = parsed.data;
  if (mode === "unassign") {
    const n = await assignLeads(leadIds, null, user!);
    return ok({ result: [{ userId: null, name: "Unassigned", count: n }] });
  }
  if (!userIds?.length) return fail("Pick at least one user", 422);
  const result = await distributeLeads(leadIds, mode, userIds, user!);
  return ok({ result });
});
