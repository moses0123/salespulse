import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Lead } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { canAccessLead } from "@/lib/scope";
import { addActivity } from "@/lib/leadService";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

const schema = z.object({
  type: z.enum(["note", "whatsapp", "email"]),
  summary: z.string().trim().min(1).max(300).optional(),
  notes: z.string().max(5000).optional(),
});

/**
 * POST /api/leads/:id/notes — log a non-call touch on the timeline: a note,
 * a WhatsApp message sent from the lead (the "WhatsApp" button logs one
 * automatically), or an email.
 */
export const POST = withErrorHandling(async (req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const lead = await Lead.findById(params.id).lean();
  if (!lead) return fail("Lead not found", 404);
  if (!canAccessLead(user!, lead)) return fail("Forbidden", 403);
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const { type, notes } = parsed.data;
  const summary = parsed.data.summary ?? (type === "whatsapp" ? "WhatsApp message sent" : type === "email" ? "Email sent" : "Note added");
  const activity = await addActivity({ leadId: lead._id, userId: user!._id, type, summary, notes });
  if (type !== "note") await Lead.updateOne({ _id: lead._id }, { lastContactAt: new Date() });
  return ok(activity, 201);
});
