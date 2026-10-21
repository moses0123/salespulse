import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Lead, Activity, FollowUp, Meeting } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { canAccessLead, isManager } from "@/lib/scope";
import { normalizePhone, normalizeCompany, normalizeSource } from "@/lib/sales";
import { addActivity } from "@/lib/leadService";
import { ensureProduct } from "@/lib/products";
import {
  LEAD_POPULATE,
  FOLLOW_UP_POPULATE,
  MEETING_POPULATE,
  serializeLead,
  serializeActivities,
  serializeFollowUps,
  serializeMeetings,
} from "@/lib/serializers";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

/** GET /api/leads/:id — lead + full timeline + follow-ups + meetings. */
export const GET = withErrorHandling(async (_req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const lead = await Lead.findById(params.id).populate(LEAD_POPULATE).lean();
  if (!lead) return fail("Lead not found", 404);
  if (!canAccessLead(user!, { assignedTo: (lead.assignedTo as any)?._id ?? lead.assignedTo })) {
    return fail("Forbidden — this lead is assigned to someone else", 403);
  }

  const [activities, followUps, meetings] = await Promise.all([
    Activity.find({ leadId: params.id }).sort({ createdAt: -1 }).populate("userId", "name role").lean(),
    FollowUp.find({ leadId: params.id }).sort({ dueAt: -1 }).populate(FOLLOW_UP_POPULATE).lean(),
    Meeting.find({ leadId: params.id }).sort({ scheduledAt: -1 }).populate(MEETING_POPULATE).lean(),
  ]);

  return ok({
    lead: serializeLead(lead),
    activities: serializeActivities(activities),
    followUps: serializeFollowUps(followUps),
    meetings: serializeMeetings(meetings),
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(1, "Lead name can't be empty").optional(),
  companyName: z.string().trim().optional(),
  phone: z.string().trim().min(5).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  industry: z.string().trim().optional(),
  location: z.string().trim().optional(),
  website: z.string().trim().optional(),
  productId: z.string().nullable().optional(),
  /** Typed product name ("" clears it) — matched to the catalogue or added to it. */
  productName: z.string().max(80).nullable().optional(),
  source: z.string().transform((v) => normalizeSource(v)).optional(),
  notes: z.string().optional(),
  dealValue: z.number().nonnegative().nullable().optional(),
  doNotContact: z.boolean().optional(),
});

const LABELS: Record<string, string> = {
  name: "Name",
  companyName: "Company",
  phone: "Phone",
  email: "Email",
  industry: "Industry",
  location: "Location",
  website: "Website",
  source: "Source",
  dealValue: "Deal value",
  doNotContact: "Do-not-contact",
};

/** PATCH /api/leads/:id — edit details (owner or manager). Field changes are logged on the timeline. */
export const PATCH = withErrorHandling(async (req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const lead = await Lead.findById(params.id);
  if (!lead) return fail("Lead not found", 404);
  if (!canAccessLead(user!, lead)) return fail("Forbidden", 403);

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const { productName, ...d } = parsed.data;
  if (productName !== undefined) d.productId = productName ? await ensureProduct(productName) : null;
  if (d.doNotContact === false && !isManager(user)) return fail("Only a manager can lift do-not-contact", 403);

  const changed: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === undefined) continue;
    const before = (lead as any)[k];
    const same = String(before ?? "") === String(v ?? "");
    if (!same) {
      (lead as any)[k] = v;
      if (LABELS[k]) changed.push(LABELS[k]);
      if (k === "notes") changed.push("Notes");
      if (k === "productId") changed.push("Product");
    }
  }
  if (d.companyName !== undefined) lead.companyKey = d.companyName ? normalizeCompany(d.companyName) : "";
  if (d.phone) {
    const p = normalizePhone(d.phone);
    lead.phoneKey = p.key;
    lead.phoneValid = p.valid;
  }
  if (d.email !== undefined) lead.email = (d.email || "").toLowerCase();
  await lead.save();

  if (changed.length) {
    await addActivity({ leadId: lead._id, userId: user!._id, type: "note", summary: `Updated: ${changed.join(", ")}` });
  }
  const full = await Lead.findById(lead._id).populate(LEAD_POPULATE).lean();
  return ok(serializeLead(full));
});
