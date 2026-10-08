/**
 * Mongoose's `.populate()` replaces a foreign-key field's value in place —
 * it doesn't add a separate field for it. The DTOs in lib/types.ts (and the
 * whole UI) expect BOTH: the raw id as a string (`pmId`, `assignedTo`, ...)
 * AND a separate populated object (`pm`, `assignee`, ...). These helpers
 * bridge that gap once, at the API boundary, instead of every route having
 * to hand-roll the same reshape.
 */

type AliasMap = Record<string, string>;

function isPopulatedRef(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && "_id" in (value as any);
}

export function aliasPopulated<T extends Record<string, any>>(doc: T | null | undefined, mapping: AliasMap): any {
  if (!doc) return doc;
  const out: Record<string, any> = { ...doc };
  for (const [rawKey, aliasKey] of Object.entries(mapping)) {
    const val = out[rawKey];
    if (isPopulatedRef(val)) {
      out[aliasKey] = val;
      out[rawKey] = String(val._id);
    } else if (val != null) {
      out[rawKey] = String(val);
    }
  }
  return out;
}

export function aliasPopulatedMany<T extends Record<string, any>>(docs: T[], mapping: AliasMap): any[] {
  return (docs || []).map((d) => aliasPopulated(d, mapping));
}
