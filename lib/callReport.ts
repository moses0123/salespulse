import "server-only";
import { Types } from "mongoose";
import { Activity, User, Product, FollowUp } from "@/models";
import type { IUser } from "@/models/User";
import { isManager } from "@/lib/scope";
import { dayKey, dayRange } from "@/lib/time";
import { LEAD_SOURCES, normalizeSource, productColumn, OUTCOME_RULES, callStatusFor, leadTypeFor, type CallOutcome } from "@/lib/sales";

/**
 * The Telecaller Daily Call Report — the team's existing Excel layout,
 * generated from logged calls instead of typed in by hand.
 *
 * One call (Activity type "call") = one row on that telecaller's sheet,
 * columns A–P exactly as the original workbook:
 *   Date · Customer Name · Phone Number · Company / Business · City ·
 *   Lead Source · Call Type · Call Status · Call Duration (mins) ·
 *   Product Interested In · Lead Type · Hot / Warm / Cold ·
 *   Reason (if Not Interested) · Next Action · Follow-up Date · Remarks
 */

export const CALL_SHEET_COLUMNS = [
  { header: "Date", width: 12 },
  { header: "Customer Name", width: 20 },
  { header: "Phone Number", width: 16 },
  { header: "Company / Business", width: 22 },
  { header: "City", width: 14 },
  { header: "Lead Source", width: 16 },
  { header: "Call Type", width: 12 },
  { header: "Call Status", width: 16 },
  { header: "Call Duration (mins)", width: 12 },
  { header: "Product Interested In", width: 24 },
  { header: "Lead Type", width: 15 },
  { header: "Hot / Warm / Cold", width: 12 },
  { header: "Reason (if Not Interested)", width: 24 },
  { header: "Next Action", width: 22 },
  { header: "Follow-up Date", width: 13 },
  { header: "Remarks", width: 40 },
] as const;

export interface CallRow {
  /** "YYYY-MM-DD" in the app timezone. */
  date: string;
  time: string;
  customerName: string;
  phone: string;
  company: string;
  city: string;
  source: string;
  callType: string;
  callStatus: string;
  durationMins: number | null;
  product: string;
  leadType: string;
  temperature: string;
  reason: string;
  nextAction: string;
  followUpDate: string | null;
  remarks: string;
}

export interface CallSummary {
  totalCalls: number;
  connected: number;
  notConnected: number;
  newLeads: number;
  followUps: number;
  talkTime: number;
  avgConnected: number;
  interested: number;
  notInterested: number;
  hot: number;
  warm: number;
  cold: number;
  dealsClosed: number;
  connectRate: number;
  interestRate: number;
}

export interface TelecallerReport {
  user: { _id: string; name: string; sheetName: string };
  rows: CallRow[];
  summary: CallSummary;
  products: Record<string, number>;
  sources: Record<string, number>;
  dueToday: number;
  overdue: number;
}

export interface CallReport {
  from: string;
  to: string;
  productNames: string[];
  sources: string[];
  telecallers: TelecallerReport[];
  total: Omit<TelecallerReport, "user" | "rows">;
}

const timeOf = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: process.env.APP_TIMEZONE || "Africa/Lusaka", hour: "2-digit", minute: "2-digit" }).format(d);

export function summarize(rows: CallRow[]): CallSummary {
  const s: CallSummary = {
    totalCalls: rows.length,
    connected: rows.filter((r) => r.callStatus === "Connected").length,
    notConnected: 0,
    newLeads: rows.filter((r) => r.callType === "New Lead").length,
    followUps: rows.filter((r) => r.callType === "Follow-up").length,
    talkTime: Math.round(rows.reduce((a, r) => a + (r.durationMins ?? 0), 0) * 10) / 10,
    avgConnected: 0,
    interested: rows.filter((r) => r.leadType === "Interested").length,
    notInterested: rows.filter((r) => r.leadType === "Not Interested").length,
    hot: rows.filter((r) => r.temperature === "Hot").length,
    warm: rows.filter((r) => r.temperature === "Warm").length,
    cold: rows.filter((r) => r.temperature === "Cold").length,
    dealsClosed: rows.filter((r) => r.nextAction === "Deal Closed").length,
    connectRate: 0,
    interestRate: 0,
  };
  s.notConnected = s.totalCalls - s.connected;
  s.avgConnected = s.connected ? Math.round((s.talkTime / s.connected) * 10) / 10 : 0;
  s.connectRate = s.totalCalls ? s.connected / s.totalCalls : 0;
  s.interestRate = s.connected ? s.interested / s.connected : 0;
  return s;
}

function sheetNameFor(name: string, taken: Set<string>) {
  const clean = (n: string) => n.replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Telecaller";
  const reserved = new Set(["dashboard", "lists"]);
  let candidate = clean(name.split(" ")[0]);
  if (taken.has(candidate.toLowerCase()) || reserved.has(candidate.toLowerCase())) candidate = clean(name);
  let n = 2;
  const base = candidate;
  while (taken.has(candidate.toLowerCase()) || reserved.has(candidate.toLowerCase())) candidate = clean(`${base.slice(0, 28)} ${n++}`);
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Build the report for [start, end). Managers get every telecaller (active
 * telemarketers, plus anyone else who made calls in the range); a
 * telemarketer gets only their own sheet.
 */
export async function buildCallReport(viewer: IUser, start: Date, end: Date, userId?: string | null): Promise<CallReport> {
  const userFilter: Record<string, unknown> = {};
  if (!isManager(viewer)) userFilter._id = viewer._id;
  else if (userId) userFilter._id = userId;

  const callFilter: Record<string, unknown> = { type: "call", createdAt: { $gte: start, $lt: end } };
  if (userFilter._id) callFilter.userId = userFilter._id;

  const calls = await Activity.find(callFilter)
    .sort({ createdAt: 1 })
    .populate("leadId", "name phone companyName location source")
    .lean();

  const callerIds = new Set(calls.map((c) => String(c.userId)));
  const users = await User.find(
    userFilter._id
      ? { _id: userFilter._id }
      : { $or: [{ role: "telemarketer", isActive: true }, { _id: { $in: [...callerIds].map((id) => new Types.ObjectId(id)) } }] }
  )
    .select("name role createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const products = await Product.find({}).select("name isActive createdAt").sort({ createdAt: 1 }).lean();
  const productName = new Map(products.map((p) => [String(p._id), p.name]));
  const productNames = [...products.filter((p) => p.isActive).map((p) => p.name), "Multiple Products"];

  // Live follow-up workload (the sheet's "Follow-ups Due" block).
  const today = dayRange();
  const [dueTodayAgg, overdueAgg] = await Promise.all([
    FollowUp.aggregate([{ $match: { status: "Pending", dueAt: { $gte: today.start, $lt: today.end } } }, { $group: { _id: "$assignedTo", n: { $sum: 1 } } }]),
    FollowUp.aggregate([{ $match: { status: "Pending", dueAt: { $lt: today.start } } }, { $group: { _id: "$assignedTo", n: { $sum: 1 } } }]),
  ]);
  const dueToday = new Map(dueTodayAgg.map((r) => [String(r._id), r.n as number]));
  const overdue = new Map(overdueAgg.map((r) => [String(r._id), r.n as number]));

  const taken = new Set<string>();
  const telecallers: TelecallerReport[] = users.map((u) => {
    const rows: CallRow[] = calls
      .filter((c) => String(c.userId) === String(u._id))
      .map((c: any) => {
        const lead = c.leadId ?? {};
        const outcome = c.outcome as CallOutcome | null;
        const ids: string[] = (c.productIds?.length ? c.productIds : c.productId ? [c.productId] : []).map(String);
        const names = ids.map((id) => productName.get(id)).filter((n): n is string => !!n);
        return {
          date: dayKey(new Date(c.createdAt)),
          time: timeOf(new Date(c.createdAt)),
          customerName: lead.name ?? "",
          phone: lead.phone ?? "",
          company: lead.companyName ?? "",
          city: lead.location ?? "",
          source: normalizeSource(lead.source),
          callType: c.callType ?? "",
          // Calls logged before the report fields existed still get a status/lead type from their outcome.
          callStatus: c.callStatus ?? (outcome ? callStatusFor(outcome) : ""),
          durationMins: c.durationMins ?? null,
          product: productColumn(names),
          leadType: c.leadType ?? (outcome ? leadTypeFor(outcome) : ""),
          temperature: c.temperature ?? "",
          reason: c.reason ?? "",
          nextAction: c.nextAction ?? (outcome === "converted" ? "Deal Closed" : ""),
          followUpDate: c.followUpAt ? dayKey(new Date(c.followUpAt)) : null,
          remarks: [c.notes, outcome && !c.callStatus ? OUTCOME_RULES[outcome]?.label : ""].filter(Boolean).join(" — "),
        };
      });
    const productsCount: Record<string, number> = Object.fromEntries(productNames.map((p) => [p, 0]));
    for (const r of rows) if (r.product in productsCount) productsCount[r.product] += 1;
    const sourcesCount: Record<string, number> = Object.fromEntries(LEAD_SOURCES.map((s) => [s, 0]));
    for (const r of rows) sourcesCount[r.source] = (sourcesCount[r.source] ?? 0) + 1;
    return {
      user: { _id: String(u._id), name: u.name, sheetName: sheetNameFor(u.name, taken) },
      rows,
      summary: summarize(rows),
      products: productsCount,
      sources: sourcesCount,
      dueToday: dueToday.get(String(u._id)) ?? 0,
      overdue: overdue.get(String(u._id)) ?? 0,
    };
  });

  const allRows = telecallers.flatMap((t) => t.rows);
  const sumMap = (key: "products" | "sources") => {
    const out: Record<string, number> = {};
    for (const t of telecallers) for (const [k, v] of Object.entries(t[key])) out[k] = (out[k] ?? 0) + v;
    return out;
  };

  return {
    from: dayKey(start),
    to: dayKey(new Date(end.getTime() - 1)),
    productNames,
    sources: [...LEAD_SOURCES],
    telecallers,
    total: {
      summary: summarize(allRows),
      products: sumMap("products"),
      sources: sumMap("sources"),
      dueToday: telecallers.reduce((a, t) => a + t.dueToday, 0),
      overdue: telecallers.reduce((a, t) => a + t.overdue, 0),
    },
  };
}
