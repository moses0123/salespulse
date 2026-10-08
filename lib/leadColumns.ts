/**
 * The columns SalesPulse understands in a bulk upload, and the header
 * spellings it recognises for each — so files arriving in different
 * layouts ("Client Name", "Full Name", "Mobile No.", "Cell", "WhatsApp"…)
 * map themselves. Shared by the upload screen (auto-detect + manual
 * override) and the import API (fallback when rows arrive un-mapped).
 */
export const LEAD_COLUMNS = [
  {
    key: "name",
    label: "Lead name",
    required: true,
    aliases: ["name", "lead name", "full name", "client name", "customer name", "contact name", "contact person", "contact", "customer", "client", "lead", "names", "first name", "fullname", "person", "prospect"],
  },
  {
    key: "phone",
    label: "Phone number",
    required: true,
    aliases: ["phone", "phone number", "phone no", "phone no.", "mobile", "mobile number", "mobile no", "mobile no.", "cell", "cell number", "cellphone", "telephone", "tel", "contact number", "contact no", "number", "whatsapp", "whatsapp number", "msisdn", "phone 1", "primary phone"],
  },
  { key: "companyName", label: "Company", aliases: ["company", "company name", "business", "business name", "organisation", "organization", "employer", "firm", "institution"] },
  { key: "email", label: "Email", aliases: ["email", "email address", "e-mail", "mail"] },
  { key: "industry", label: "Industry", aliases: ["industry", "sector", "business type", "category"] },
  { key: "location", label: "Location", aliases: ["location", "city", "town", "address", "province", "area", "region"] },
  { key: "website", label: "Website", aliases: ["website", "web", "url", "site"] },
  { key: "product", label: "Product of interest", aliases: ["product", "product of interest", "solution", "interest", "service"] },
  { key: "source", label: "Lead source", aliases: ["source", "lead source", "channel", "origin"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comments", "comment", "remarks", "description"] },
] as const;

export type LeadColumnKey = (typeof LEAD_COLUMNS)[number]["key"];

const clean = (h: string) => h.toLowerCase().replace(/[_\-*:#]+/g, " ").replace(/\s+/g, " ").replace(/\.$/, "").trim();

/** Best-guess mapping from a file's headers to SalesPulse columns. Exact alias match first, then "contains". */
export function guessMapping(headers: string[], opts: { exactOnly?: boolean } = {}): Partial<Record<LeadColumnKey, string>> {
  const out: Partial<Record<LeadColumnKey, string>> = {};
  const used = new Set<string>();
  const passes = opts.exactOnly ? (["exact"] as const) : (["exact", "contains"] as const);
  for (const pass of passes) {
    for (const col of LEAD_COLUMNS) {
      if (out[col.key]) continue;
      const hit = headers.find((h) => {
        if (used.has(h) || h.length > 40) return false; // long cells are titles/sentences, not headers
        const c = clean(h);
        return pass === "exact"
          ? (col.aliases as readonly string[]).includes(c)
          : (col.aliases as readonly string[]).some((a) => a.length > 3 && c.includes(a));
      });
      if (hit) {
        out[col.key] = hit;
        used.add(hit);
      }
    }
  }
  return out;
}

/** "0977 123456 / 0966 111222" → first number + the rest (kept in notes). */
export function splitPhones(raw: string): { primary: string; others: string[] } {
  const parts = (raw || "")
    .split(/\s*(?:\/|,|;|\||\bor\b|&)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, "").length >= 5);
  return { primary: parts[0] ?? (raw || "").trim(), others: parts.slice(1) };
}

/**
 * Content-based fallback for files with unhelpful (or no) headers: the
 * phone column is the one where most values look like phone numbers; the
 * name column is the first mostly-text column that isn't an email.
 */
export function guessByContent(headers: string[], rows: Record<string, string>[]): Partial<Record<LeadColumnKey, string>> {
  const sample = rows.slice(0, 50);
  const score = (h: string, test: (v: string) => boolean) => {
    const vals = sample.map((r) => (r[h] ?? "").trim()).filter(Boolean);
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const isPhone = (v: string) => {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 15 && digits.length / v.replace(/\s/g, "").length > 0.7;
  };
  const isName = (v: string) => /[a-z]/i.test(v) && !v.includes("@") && !/^https?:|www\./i.test(v) && v.replace(/\D/g, "").length < 4;
  const out: Partial<Record<LeadColumnKey, string>> = {};
  const phone = [...headers].sort((a, b) => score(b, isPhone) - score(a, isPhone))[0];
  if (phone && score(phone, isPhone) >= 0.6) out.phone = phone;
  const name = headers.find((h) => h !== out.phone && score(h, isName) >= 0.6);
  if (name) out.name = name;
  return out;
}
