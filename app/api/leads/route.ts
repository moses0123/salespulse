import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Lead, User } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { leadScope, isManager } from "@/lib/scope";
import { LEAD_STAGES, TEMPERATURES, OPEN_STAGES, normalizePhone, normalizeCompany, normalizeSource } from "@/lib/sales";
import { findDuplicates } from "@/lib/duplicates";
import { ensureProduct } from "@/lib/products";
import { addActivity, createFollowUp, refreshNextAction } from "@/lib/leadService";
import { LEAD_POPULATE, serializeLead, serializeLeads } from "@/lib/serializers";
import { getSettingsWithSecrets } from "@/lib/settings";

export const dynamic = "force-dynamic";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /api/leads — search + filter + paginate, role-scoped.
 *   q, stage (comma list | "open"), temperature, assignedTo ("me" | "none" | id),
 *   source, productId, industry, filter ("stale" | "overdue" | "no_next_action" | "unworked"),
 *   sort ("recent" | "score" | "next" | "company"), page, pageSize
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const and: Record<string, unknown>[] = [leadScope(user!)];

  const q = sp.get("q")?.trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), "i");
    const digits = q.replace(/\D/g, "");
    const or: Record<string, unknown>[] = [{ name: rx }, { companyName: rx }, { email: rx }, { location: rx }];
    if (digits.length >= 4) or.push({ phoneKey: new RegExp(escapeRegex(digits.replace(/^0/, ""))) });
    and.push({ $or: or });
  }
  const stage = sp.get("stage");
  if (stage === "open") and.push({ stage: { $in: OPEN_STAGES } });
  else if (stage) and.push({ stage: { $in: stage.split(",").filter((s) => (LEAD_STAGES as readonly string[]).includes(s)) } });
  const temperature = sp.get("temperature");
  if (temperature && (TEMPERATURES as readonly string[]).includes(temperature)) and.push({ temperature });
  const assignedTo = sp.get("assignedTo");
  if (assignedTo === "me") and.push({ assignedTo: user!._id });
  else if (assignedTo === "none" && isManager(user)) and.push({ assignedTo: null });
  else if (assignedTo && isManager(user)) and.push({ assignedTo });
  const source = sp.get("source");
  if (source) and.push({ source });
  const productId = sp.get("productId");
  if (productId) and.push({ productId });
  const industry = sp.get("industry");
  if (industry) and.push({ industry: new RegExp(`^${escapeRegex(industry)}$`, "i") });

  const filter = sp.get("filter");
  const now = new Date();
  if (filter === "stale") {
    const settings = await getSettingsWithSecrets();
    const hours = settings?.sales?.staleLeadHours ?? 48;
    and.push({ stage: { $in: OPEN_STAGES }, doNotContact: false, lastActivityAt: { $lt: new Date(now.getTime() - hours * 3600_000) } });
  } else if (filter === "overdue") {
    and.push({ nextActionAt: { $lt: now }, stage: { $in: OPEN_STAGES } });
  } else if (filter === "no_next_action") {
    and.push({ nextActionAt: null, stage: { $in: OPEN_STAGES.filter((s) => s !== "New") }, doNotContact: false });
  } else if (filter === "unworked") {
    and.push({ stage: "New", callCount: 0 });
  } else if (filter === "hot") {
    and.push({ temperature: "Hot", stage: { $in: OPEN_STAGES } });
  }

  const sortKey = sp.get("sort") ?? "recent";
  const sort: Record<string, 1 | -1> =
    sortKey === "score" ? { score: -1, updatedAt: -1 } :
    sortKey === "next" ? { nextActionAt: 1, score: -1 } :
    sortKey === "name" || sortKey === "company" ? { name: 1 } :
    { lastActivityAt: -1 };

  const page = Math.max(1, Number(sp.get("page") || 1));
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") || 25)));
  const query = { $and: and };

  const [items, total] = await Promise.all([
    Lead.find(query).sort(sort).skip((page - 1) * pageSize).limit(pageSize).populate(LEAD_POPULATE).lean(),
    Lead.countDocuments(query),
  ]);

  return ok({ items: serializeLeads(items), total, page, pageSize });
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Lead name is required"),
  phone: z.string().trim().min(5, "Phone number is required"),
  companyName: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  industry: z.string().trim().optional(),
  location: z.string().trim().optional(),
  website: z.string().trim().optional(),
  productId: z.string().nullable().optional(),
  /** Typed product name — matched to the catalogue or added to it. Takes precedence over productId. */
  productName: z.string().max(80).nullable().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  dealValue: z.number().nonnegative().nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  /** Create even though a duplicate was found (manager only for exact phone matches). */
  force: z.boolean().optional(),
  firstFollowUp: z.object({ title: z.string().min(1), dueAt: z.string() }).nullable().optional(),
});

/**
 * POST /api/leads — any signed-in user. A telemarketer's own sourced lead is
 * assigned to themselves; managers may assign it to anyone (or no one).
 * Returns 409 with the matches if it looks like a duplicate, unless `force`.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const d = parsed.data;

  const dups = await findDuplicates({ phone: d.phone, companyName: d.companyName, email: d.email });
  const phoneDup = dups.some((m) => m.matchedOn.includes("phone"));
  if (dups.length && (!d.force || (phoneDup && !isManager(user)))) {
    return fail(
      phoneDup ? "This phone number already exists in SalesPulse." : "A lead with this company or email already exists.",
      409,
      { duplicates: dups, canForce: !phoneDup || isManager(user) }
    );
  }

  let assignedTo: string | null = String(user!._id);
  if (isManager(user)) {
    assignedTo = d.assignedTo === undefined ? String(user!._id) : d.assignedTo;
    if (assignedTo) {
      const target = await User.findById(assignedTo).lean();
      if (!target || !target.isActive) return fail("Assignee not found or inactive", 422);
    }
  }

  const phone = normalizePhone(d.phone);
  const lead = await Lead.create({
    name: d.name,
    companyName: d.companyName ?? "",
    companyKey: d.companyName ? normalizeCompany(d.companyName) : "",
    phone: d.phone,
    phoneKey: phone.key,
    phoneValid: phone.valid,
    email: d.email ?? "",
    industry: d.industry ?? "",
    location: d.location ?? "",
    website: d.website ?? "",
    productId: d.productName ? await ensureProduct(d.productName) : d.productId || null,
    source: normalizeSource(d.source),
    notes: d.notes ?? "",
    dealValue: d.dealValue ?? null,
    assignedTo,
    assignedAt: assignedTo ? new Date() : null,
    createdBy: user!._id,
  });

  await addActivity({
    leadId: lead._id,
    userId: user!._id,
    type: "lead_created",
    summary: `Lead created (${lead.source})${dups.length ? " — possible duplicate acknowledged" : ""}`,
  });
  if (d.firstFollowUp) {
    await createFollowUp({ lead, actor: user!, title: d.firstFollowUp.title, dueAt: new Date(d.firstFollowUp.dueAt) });
    await refreshNextAction(lead._id);
  }

  const full = await Lead.findById(lead._id).populate(LEAD_POPULATE).lean();
  return ok(serializeLead(full), 201);
});
