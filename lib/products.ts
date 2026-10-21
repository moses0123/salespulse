import "server-only";
import { Product } from "@/models";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turn a typed product name into a catalogue product: reuse the existing one
 * (case-insensitive, so "visit flow" = "Visit Flow"), reactivating it if it
 * had been switched off, or add it to the catalogue. Lets anyone type a
 * product on a lead or call instead of being stuck with an empty dropdown.
 */
export async function ensureProduct(rawName: string | null | undefined): Promise<string | null> {
  const name = (rawName || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return null;
  const existing = await Product.findOne({ name: new RegExp(`^${escape(name)}$`, "i") });
  if (existing) {
    if (!existing.isActive) {
      existing.isActive = true;
      await existing.save();
    }
    return String(existing._id);
  }
  try {
    const created = await Product.create({ name });
    return String(created._id);
  } catch (err: any) {
    // Two people typing the same new product at once — the unique index wins; use that one.
    if (err?.code === 11000) {
      const p = await Product.findOne({ name: new RegExp(`^${escape(name)}$`, "i") }).lean();
      return p ? String(p._id) : null;
    }
    throw err;
  }
}
