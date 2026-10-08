import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Lead } from "@/models";
import type { ILead } from "@/models/Lead";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { canAccessLead } from "@/lib/scope";
import { LEAD_STAGES } from "@/lib/sales";
import { changeStage } from "@/lib/leadService";
import { LEAD_POPULATE, serializeLead } from "@/lib/serializers";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

const schema = z.object({
  stage: z.enum(LEAD_STAGES),
  lostReason: z.string().trim().optional(),
  dealValue: z.number().nonnegative().nullable().optional(),
});

/** PATCH /api/leads/:id/stage — manual pipeline move (board drag, "Mark proposal sent", Won/Lost). */
export const PATCH = withErrorHandling(async (req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const lead = await Lead.findById(params.id).lean();
  if (!lead) return fail("Lead not found", 404);
  if (!canAccessLead(user!, lead)) return fail("Forbidden", 403);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  if (parsed.data.stage === "Lost" && !parsed.data.lostReason) return fail("Give a reason for marking the lead Lost", 422);

  await changeStage(lead as ILead, user!, parsed.data.stage, {
    lostReason: parsed.data.lostReason,
    dealValue: parsed.data.dealValue,
  });
  const full = await Lead.findById(params.id).populate(LEAD_POPULATE).lean();
  return ok(serializeLead(full));
});
