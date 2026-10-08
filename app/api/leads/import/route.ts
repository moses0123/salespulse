import { NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import connectDB from "@/lib/db";
import { Lead, Product, Activity, ImportLog } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { pickField } from "@/lib/csv";
import { isManager } from "@/lib/scope";
import { LEAD_COLUMNS, splitPhones, type LeadColumnKey } from "@/lib/leadColumns";
import { LEAD_SOURCES, normalizePhone, normalizeCompany, type LeadSource } from "@/lib/sales";
import { distributeLeads } from "@/lib/assignment";
import { assignLeads } from "@/lib/leadService";

export const dynamic = "force-dynamic";

const schema = z.object({
  rows: z.array(z.record(z.string())).min(1).max(5000),
  mode: z.enum(["preview", "commit"]),
  fileName: z.string().max(300).optional(),
  includeCompanyMatches: z.boolean().optional(),
  includeInvalidPhones: z.boolean().optional(),
  defaultSource: z.enum(LEAD_SOURCES).optional(),
  defaultProductId: z.string().nullable().optional(),
  assign: z
    .object({ mode: z.enum(["none", "user", "round_robin", "least_loaded"]), userIds: z.array(z.string()).optional() })
    .optional(),
});

type RowStatus = "ok" | "missing_fields" | "invalid_phone" | "duplicate_in_file" | "existing_phone" | "existing_company";

export interface ImportRowResult {
  row: number;
  status: RowStatus;
  name: string;
  companyName?: string;
  phone: string;
  message?: string;
  existingOwner?: string | null;
}

/** Read a column from a row by its canonical key, or any recognised header spelling. */
function col(raw: Record<string, string>, key: LeadColumnKey): string {
  const def = LEAD_COLUMNS.find((c) => c.key === key)!;
  return (pickField(raw, key, def.label, ...def.aliases) || "").trim();
}

/**
 * GET /api/leads/import — recent bulk uploads (telemarketers: their own; managers: everyone's).
 */
export const GET = withErrorHandling(async () => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const filter = isManager(user) ? {} : { uploadedBy: user!._id };
  const logs = await ImportLog.find(filter).sort({ createdAt: -1 }).limit(15).populate("uploadedBy", "name role").lean();
  return ok(logs);
});

/**
 * POST /api/leads/import — bulk upload. Any signed-in user.
 *
 * Only the lead's NAME and PHONE are required; every other column is
 * optional. Rows arrive already mapped to SalesPulse columns by the upload
 * screen (so any file layout works), with header-alias matching as a
 * fallback. `mode: "preview"` classifies every row without writing;
 * `mode: "commit"` imports the clean rows (plus any optional categories
 * ticked) and records the upload in ImportLog.
 *
 * Exact phone duplicates are never imported. A telemarketer's upload is
 * always assigned to themselves; managers may leave it unassigned or
 * distribute it.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const d = parsed.data;

  const products = await Product.find({}).select("name").lean();
  const productByName = new Map(products.map((p) => [p.name.toLowerCase().trim(), p._id]));
  const sourceByName = new Map(LEAD_SOURCES.map((s) => [s.toLowerCase(), s]));

  const prepared = d.rows.map((raw, i) => {
    const name = col(raw, "name");
    const companyName = col(raw, "companyName");
    const { primary, others } = splitPhones(col(raw, "phone"));
    const productName = col(raw, "product");
    const sourceName = col(raw, "source");
    const phone = normalizePhone(primary);
    const productId = productName ? productByName.get(productName.toLowerCase()) ?? null : null;
    const notes = [
      col(raw, "notes"),
      others.length ? `Other number${others.length > 1 ? "s" : ""}: ${others.join(", ")}` : "",
      productName && !productId ? `Product of interest: ${productName}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      row: Number(raw._row) || i + 2, // the sheet row number sent by the upload screen; else assume a header on row 1
      name,
      companyName,
      companyKey: companyName ? normalizeCompany(companyName) : "",
      phone: primary,
      phoneKey: phone.key,
      phoneValid: phone.valid,
      email: col(raw, "email").toLowerCase(),
      industry: col(raw, "industry"),
      location: col(raw, "location"),
      website: col(raw, "website"),
      productId,
      productName,
      source: (sourceByName.get(sourceName.toLowerCase()) ?? d.defaultSource ?? "Excel/CSV import") as LeadSource,
      notes,
    };
  });

  const phoneKeys = prepared.filter((p) => p.phoneKey).map((p) => p.phoneKey);
  const companyKeys = prepared.filter((p) => p.companyKey).map((p) => p.companyKey);
  const or: Record<string, unknown>[] = [{ phoneKey: { $in: phoneKeys } }];
  if (companyKeys.length) or.push({ companyKey: { $in: companyKeys } });
  const existing = await Lead.find({ $or: or }).select("phoneKey companyKey assignedTo name companyName").populate("assignedTo", "name").lean();
  const existingByPhone = new Map(existing.map((e: any) => [e.phoneKey, e]));
  const existingByCompany = new Map(existing.filter((e: any) => e.companyKey).map((e: any) => [e.companyKey, e]));

  const seenPhones = new Set<string>();
  const results: (ImportRowResult & { data: (typeof prepared)[number] })[] = prepared.map((p) => {
    const base = { row: p.row, name: p.name, companyName: p.companyName, phone: p.phone, data: p };
    if (!p.name || !p.phone) {
      return { ...base, status: "missing_fields", message: !p.name && !p.phone ? "No name or phone" : !p.name ? "No lead name" : "No phone number" };
    }
    if (seenPhones.has(p.phoneKey)) return { ...base, status: "duplicate_in_file", message: "Same number appears earlier in this file" };
    seenPhones.add(p.phoneKey);
    const byPhone: any = existingByPhone.get(p.phoneKey);
    if (byPhone) {
      return { ...base, status: "existing_phone", message: `Number already in SalesPulse (${byPhone.name || byPhone.companyName})`, existingOwner: byPhone.assignedTo?.name ?? null };
    }
    const byCompany: any = p.companyKey ? existingByCompany.get(p.companyKey) : null;
    if (byCompany) {
      return { ...base, status: "existing_company", message: `Company already exists (${byCompany.companyName}, lead ${byCompany.name})`, existingOwner: byCompany.assignedTo?.name ?? null };
    }
    if (!p.phoneValid) return { ...base, status: "invalid_phone", message: "Number looks too short/long" };
    return { ...base, status: "ok", message: p.productName && !p.productId ? `Unknown product "${p.productName}" — kept in notes` : undefined };
  });

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const strip = (r: (typeof results)[number]) => {
    const { data: _data, ...rest } = r;
    return rest;
  };

  if (d.mode === "preview") {
    return ok({ summary, total: results.length, results: results.map(strip) });
  }

  const toImport = results.filter(
    (r) =>
      r.status === "ok" ||
      (r.status === "existing_company" && d.includeCompanyMatches) ||
      (r.status === "invalid_phone" && d.includeInvalidPhones)
  );
  const batch = randomUUID();
  const docs = toImport.map(({ data: p }) => ({
    name: p.name,
    companyName: p.companyName,
    companyKey: p.companyKey,
    phone: p.phone,
    phoneKey: p.phoneKey,
    phoneValid: p.phoneValid,
    email: p.email,
    industry: p.industry,
    location: p.location,
    website: p.website,
    productId: p.productId ?? d.defaultProductId ?? null,
    source: p.source,
    notes: p.notes,
    createdBy: user!._id,
    importBatch: batch,
    lastActivityAt: new Date(),
  }));
  const created = docs.length ? await Lead.insertMany(docs) : [];
  if (created.length) {
    await Activity.insertMany(
      created.map((l) => ({
        leadId: l._id,
        userId: user!._id,
        type: "imported",
        summary: `Bulk upload${d.fileName ? ` — ${d.fileName}` : ""} (${l.source})`,
      }))
    );
  }

  let assignment: { userId: string; name: string; count: number }[] = [];
  if (created.length) {
    if (!isManager(user)) {
      const n = await assignLeads(created.map((l) => l._id), user!._id, user!, user!.name);
      assignment = [{ userId: String(user!._id), name: user!.name, count: n }];
    } else if (d.assign && d.assign.mode !== "none" && d.assign.userIds?.length) {
      assignment = await distributeLeads(created.map((l) => l._id), d.assign.mode, d.assign.userIds, user!);
    }
  }

  await ImportLog.create({
    batch,
    fileName: d.fileName ?? "",
    uploadedBy: user!._id,
    total: results.length,
    imported: created.length,
    skipped: results.length - created.length,
    summary,
    assignment,
  });

  return ok({ summary, imported: created.length, skipped: results.length - created.length, batch, assignment });
});
