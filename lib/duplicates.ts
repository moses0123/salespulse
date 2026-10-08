import "server-only";
import { Lead } from "@/models";
import { normalizePhone, normalizeCompany } from "@/lib/sales";
import type { DuplicateMatchDTO } from "@/lib/types";

/**
 * §6/§21 — before a lead is created, imported or called, check whether the
 * phone number, company or email already exists, and return who owns it,
 * when it was last contacted and what's scheduled next.
 */
export async function findDuplicates(input: {
  phone?: string;
  companyName?: string;
  email?: string;
  excludeId?: string;
}): Promise<DuplicateMatchDTO[]> {
  const or: Record<string, unknown>[] = [];
  const phoneKey = input.phone ? normalizePhone(input.phone).key : "";
  const companyKey = input.companyName ? normalizeCompany(input.companyName) : "";
  const email = (input.email || "").trim().toLowerCase();
  if (phoneKey.length >= 7) or.push({ phoneKey });
  if (companyKey.length >= 2) or.push({ companyKey });
  if (email) or.push({ email });
  if (!or.length) return [];

  const filter: Record<string, unknown> = { $or: or };
  if (input.excludeId) filter._id = { $ne: input.excludeId };
  const matches = await Lead.find(filter).populate("assignedTo", "name role").limit(10).lean();

  return matches.map((m: any) => {
    const matchedOn: DuplicateMatchDTO["matchedOn"] = [];
    if (phoneKey && m.phoneKey === phoneKey) matchedOn.push("phone");
    if (companyKey && m.companyKey === companyKey) matchedOn.push("company");
    if (email && m.email === email) matchedOn.push("email");
    return {
      _id: String(m._id),
      name: m.name,
      companyName: m.companyName,
      phone: m.phone,
      stage: m.stage,
      assignee: m.assignedTo ? { _id: String(m.assignedTo._id), name: m.assignedTo.name, role: m.assignedTo.role } : null,
      lastContactAt: m.lastContactAt ? new Date(m.lastContactAt).toISOString() : null,
      nextActionAt: m.nextActionAt ? new Date(m.nextActionAt).toISOString() : null,
      nextActionTitle: m.nextActionTitle ?? null,
      matchedOn,
    };
  });
}
