/**
 * SalesPulse domain rules — the single source of truth for pipeline stages,
 * call outcomes, lead scoring, and what each outcome does to a lead.
 * Pure TypeScript with no server imports, so both API routes and client
 * components share exactly the same definitions.
 */

// ── Pipeline ────────────────────────────────────────────────────────────────

export const LEAD_STAGES = [
  "New",
  "Contacted",
  "Connected",
  "Interested",
  "Qualified",
  "Meeting Booked",
  "Demo Completed",
  "Proposal Sent",
  "Negotiation",
  "Won",
  "Lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Stages that still need work — everything except the two closed ones. */
export const OPEN_STAGES: LeadStage[] = LEAD_STAGES.filter((s) => s !== "Won" && s !== "Lost");

export function stageRank(stage: LeadStage): number {
  return LEAD_STAGES.indexOf(stage);
}

/**
 * Move a lead forward to `target` only if that's further along than where it
 * is — a "call back later" on a lead already at Proposal Sent must not drag it
 * back to Connected. Won/Lost are terminal targets and always apply.
 */
export function advanceStage(current: LeadStage, target: LeadStage): LeadStage {
  if (target === "Won" || target === "Lost") return target;
  if (current === "Won" || current === "Lost") return target; // re-opened by new positive activity
  return stageRank(target) > stageRank(current) ? target : current;
}

// ── Sources / temperature ──────────────────────────────────────────────────

export const LEAD_SOURCES = [
  "Internet research",
  "Google Maps",
  "Website",
  "Facebook",
  "LinkedIn",
  "Existing database",
  "Referral",
  "Website enquiry",
  "WhatsApp enquiry",
  "Marketing campaign",
  "Excel/CSV import",
  "Other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const TEMPERATURES = ["Hot", "Warm", "Cold"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

/** 80–100 Hot, 40–79 Warm, 0–39 Cold. */
export function temperatureForScore(score: number): Temperature {
  if (score >= 80) return "Hot";
  if (score >= 40) return "Warm";
  return "Cold";
}

export function clampScore(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// ── Call outcomes ──────────────────────────────────────────────────────────

export const CALL_OUTCOMES = [
  "no_answer",
  "busy",
  "wrong_number",
  "not_interested",
  "call_back",
  "interested",
  "meeting_requested",
  "meeting_booked",
  "proposal_requested",
  "follow_up_required",
  "converted",
  "do_not_contact",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export type NextActionType = "follow_up" | "meeting";

export interface OutcomeRule {
  label: string;
  /** Someone actually picked up. */
  connected: boolean;
  /** Pipeline stage this outcome moves the lead to (forward-only, see advanceStage). */
  stage: LeadStage;
  /** Base score change. */
  score: number;
  /** "required" → the call can't be saved without a next action; "meeting" → a meeting must be booked; "none" → no next action. */
  nextAction: "required" | "meeting" | "none";
  /** Default follow-up title when one is created. */
  defaultFollowUp?: string;
  /** Hours from now to suggest for the next follow-up. */
  suggestHours?: number;
  /** Show the interest capture fields (temperature, need, pricing). */
  captureInterest?: boolean;
  tone: "neutral" | "negative" | "positive" | "win";
}

export const OUTCOME_RULES: Record<CallOutcome, OutcomeRule> = {
  no_answer: { label: "No answer", connected: false, stage: "Contacted", score: 0, nextAction: "required", defaultFollowUp: "Retry call — no answer", suggestHours: 24, tone: "neutral" },
  busy: { label: "Busy", connected: false, stage: "Contacted", score: 0, nextAction: "required", defaultFollowUp: "Retry call — line busy", suggestHours: 3, tone: "neutral" },
  wrong_number: { label: "Wrong number", connected: false, stage: "Contacted", score: 0, nextAction: "none", tone: "negative" },
  not_interested: { label: "Not interested", connected: true, stage: "Lost", score: -20, nextAction: "none", tone: "negative" },
  call_back: { label: "Call back later", connected: true, stage: "Connected", score: 10, nextAction: "required", defaultFollowUp: "Call back as requested", suggestHours: 24, tone: "neutral" },
  interested: { label: "Interested", connected: true, stage: "Interested", score: 30, nextAction: "required", defaultFollowUp: "Follow up on interest", suggestHours: 48, captureInterest: true, tone: "positive" },
  meeting_requested: { label: "Meeting requested", connected: true, stage: "Qualified", score: 30, nextAction: "required", defaultFollowUp: "Confirm meeting date", suggestHours: 24, captureInterest: true, tone: "positive" },
  meeting_booked: { label: "Meeting booked", connected: true, stage: "Meeting Booked", score: 35, nextAction: "meeting", captureInterest: true, tone: "positive" },
  proposal_requested: { label: "Proposal requested", connected: true, stage: "Qualified", score: 40, nextAction: "required", defaultFollowUp: "Send proposal", suggestHours: 24, captureInterest: true, tone: "positive" },
  follow_up_required: { label: "Follow-up required", connected: true, stage: "Connected", score: 10, nextAction: "required", defaultFollowUp: "Follow up", suggestHours: 48, tone: "neutral" },
  converted: { label: "Converted", connected: true, stage: "Won", score: 100, nextAction: "none", tone: "win" },
  do_not_contact: { label: "Do not contact", connected: true, stage: "Lost", score: -100, nextAction: "none", tone: "negative" },
};

/**
 * Score rules from the spec (§13): answered +10, shows interest +20,
 * identifies a need +20, meeting booked +25, asks for pricing +15, proposal
 * requested +30. The base values in OUTCOME_RULES already fold in "answered"
 * (+10) for every connected outcome; the two checkbox signals below add on top.
 */
export const SCORE_NEED_IDENTIFIED = 20;
export const SCORE_ASKED_PRICING = 15;

export function computeScore(params: {
  current: number;
  outcome: CallOutcome;
  needIdentified?: boolean;
  askedPricing?: boolean;
}): number {
  const rule = OUTCOME_RULES[params.outcome];
  if (params.outcome === "converted") return 100;
  if (params.outcome === "do_not_contact") return 0;
  let next = params.current + rule.score;
  if (params.needIdentified) next += SCORE_NEED_IDENTIFIED;
  if (params.askedPricing) next += SCORE_ASKED_PRICING;
  return clampScore(next);
}

// ── Meetings ───────────────────────────────────────────────────────────────

export const MEETING_OUTCOMES = [
  "demo_completed",
  "proposal_requested",
  "follow_up_required",
  "negotiation",
  "not_interested",
  "converted",
  "reschedule",
] as const;
export type MeetingOutcome = (typeof MEETING_OUTCOMES)[number];

export const MEETING_OUTCOME_RULES: Record<
  MeetingOutcome,
  { label: string; stage: LeadStage | null; score: number; nextAction: "required" | "reschedule" | "none"; defaultFollowUp?: string }
> = {
  demo_completed: { label: "Demo completed", stage: "Demo Completed", score: 10, nextAction: "required", defaultFollowUp: "Follow up after demo" },
  proposal_requested: { label: "Proposal requested", stage: "Demo Completed", score: 30, nextAction: "required", defaultFollowUp: "Send proposal" },
  follow_up_required: { label: "Follow-up required", stage: null, score: 0, nextAction: "required", defaultFollowUp: "Follow up after meeting" },
  negotiation: { label: "Negotiation", stage: "Negotiation", score: 10, nextAction: "required", defaultFollowUp: "Continue negotiation" },
  not_interested: { label: "Not interested", stage: "Lost", score: -30, nextAction: "none" },
  converted: { label: "Converted", stage: "Won", score: 100, nextAction: "none" },
  reschedule: { label: "Reschedule", stage: null, score: 0, nextAction: "reschedule" },
};

// ── Duplicate detection helpers ────────────────────────────────────────────

/** Country code applied to local numbers ("0977 123456" → "260977123456"). Override with NEXT_PUBLIC_DEFAULT_COUNTRY_CODE. */
export const DEFAULT_COUNTRY_CODE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE) || "260";

/**
 * Normalise a phone number to digits with a country code, so "+260 977-123456",
 * "0977123456" and "260977123456" all collide as the same number.
 */
export function normalizePhone(raw: string, countryCode = DEFAULT_COUNTRY_CODE): { key: string; valid: boolean } {
  let digits = (raw || "").replace(/[^\d+]/g, "");
  const hadPlus = digits.startsWith("+");
  digits = digits.replace(/\+/g, "");
  if (!hadPlus && digits.startsWith("00")) digits = digits.slice(2);
  else if (!hadPlus && digits.startsWith("0")) digits = countryCode + digits.slice(1);
  else if (!hadPlus && digits.length <= 9 && digits.length > 0) digits = countryCode + digits;
  const valid = digits.length >= 10 && digits.length <= 15;
  return { key: digits, valid };
}

const COMPANY_SUFFIXES = /\b(limited|ltd|plc|inc|llc|llp|pty|co|company|corp|corporation|group|the|zambia|enterprises?)\b/g;

/** Lower-case, strip punctuation and common legal suffixes: "ABC Logistics Ltd." → "abc logistics". */
export function normalizeCompany(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(COMPANY_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Display ────────────────────────────────────────────────────────────────

/** How a lead is titled everywhere: its name, falling back to company, then phone. */
export function leadTitle(l: { name?: string | null; companyName?: string | null; phone?: string | null }) {
  return (l.name || "").trim() || (l.companyName || "").trim() || l.phone || "Unnamed lead";
}

/** "ABC Logistics · 0977 123456" — company (if any) and phone, for the line under the title. */
export function leadSubtitle(l: { name?: string | null; companyName?: string | null; phone?: string | null }) {
  const parts: string[] = [];
  if (l.name && l.companyName) parts.push(l.companyName);
  if (l.phone) parts.push(l.phone);
  return parts.join(" · ");
}

// ── WhatsApp ───────────────────────────────────────────────────────────────

export const DEFAULT_WHATSAPP_TEMPLATE =
  "Hello {{contact}}, this is {{agent}} from Marichi Solutions. Thank you for speaking with me. As discussed, I'll share more information about our {{product}} solution.";

export function fillWhatsAppTemplate(template: string, vars: Record<string, string | undefined>) {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => (vars[k] ?? "").trim())
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** wa.me deep link — opens WhatsApp (app or web) with the message pre-filled. */
export function whatsAppLink(phoneKey: string, text: string) {
  return `https://wa.me/${phoneKey}?text=${encodeURIComponent(text)}`;
}

// ── Funnel metrics (§22) ───────────────────────────────────────────────────

export function rate(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function formatRate(r: number | null) {
  if (r === null) return "—";
  return `${Math.round(r * 1000) / 10}%`;
}
