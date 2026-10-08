import { NextRequest } from "next/server";
import connectDB from "@/lib/db";
import { Lead } from "@/models";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { leadScope, isManager } from "@/lib/scope";
import { LEAD_STAGES } from "@/lib/sales";
import { LEAD_POPULATE, serializeLeads } from "@/lib/serializers";

export const dynamic = "force-dynamic";

/** GET /api/pipeline?assignedTo=&productId= — per-stage counts, value and the top leads in each column. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const base: Record<string, unknown> = { ...leadScope(user!) };
  if (isManager(user) && sp.get("assignedTo")) base.assignedTo = sp.get("assignedTo");
  if (sp.get("productId")) base.productId = sp.get("productId");
  const perColumn = Math.min(100, Number(sp.get("limit") || 40));

  const columns = await Promise.all(
    LEAD_STAGES.map(async (stage) => {
      const filter = { ...base, stage };
      const closed = stage === "Won" || stage === "Lost";
      const [items, agg] = await Promise.all([
        Lead.find(filter)
          .sort(closed ? { updatedAt: -1 } : { score: -1, nextActionAt: 1 })
          .limit(closed ? 15 : perColumn)
          .populate(LEAD_POPULATE)
          .lean(),
        Lead.aggregate([{ $match: filter }, { $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$dealValue" } } }]),
      ]);
      return { stage, count: agg[0]?.count ?? 0, value: agg[0]?.value ?? 0, items: serializeLeads(items) };
    })
  );
  return ok(columns);
});
