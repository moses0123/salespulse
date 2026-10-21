"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Phone, CalendarClock, CalendarPlus, CheckCircle2, Timer } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useProducts } from "@/hooks/useCatalog";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import { StageBadge, TemperatureBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/client";
import { cn, suggestDateTimeLocal, formatDue } from "@/lib/utils";
import {
  CALL_OUTCOMES,
  OUTCOME_RULES,
  TEMPERATURES,
  NOT_INTERESTED_REASONS,
  FOLLOW_UP_ACTIONS,
  callStatusFor,
  leadTypeFor,
  defaultNextAction,
  channelForAction,
  leadTitle,
  leadSubtitle,
  type CallOutcome,
  type Temperature,
} from "@/lib/sales";
import type { LeadDetailDTO } from "@/lib/types";

const toneRing = {
  neutral: "data-[on=true]:ring-ink-muted data-[on=true]:bg-surface-hover/10",
  negative: "data-[on=true]:ring-critical-500 data-[on=true]:bg-critical-500/10",
  positive: "data-[on=true]:ring-primary-600 data-[on=true]:bg-primary-500/10",
  win: "data-[on=true]:ring-healthy-500 data-[on=true]:bg-healthy-500/10",
};

const minutesSince = (t: number) => Math.max(0, Math.round(((Date.now() - t) / 60000) * 10) / 10);

/**
 * After every call: outcome → products / interest → reason → next action.
 * Captures every column of the Telecaller Daily Call Report (call status,
 * call type, duration, product, lead type, Hot/Warm/Cold, reason, next
 * action, follow-up date, remarks) so the report fills itself in.
 */
export default function LogCallModal() {
  const { logCall, closeLogCall, triggerRefresh , refreshKey } = useUI();
  const products = useProducts(refreshKey);
  const [detail, setDetail] = useState<LeadDetailDTO | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  /** Products typed on the call that aren't in the catalogue yet. */
  const [newProducts, setNewProducts] = useState<string[]>([]);
  const [productDraft, setProductDraft] = useState("");
  const [temperature, setTemperature] = useState<Temperature | "">("");
  const [needIdentified, setNeedIdentified] = useState(false);
  const [askedPricing, setAskedPricing] = useState(false);
  const [dealValue, setDealValue] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("");
  const [durationTouched, setDurationTouched] = useState(false);
  const [nextLabel, setNextLabel] = useState<string>("Follow-up Call");
  const [nextDetails, setNextDetails] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [nextChannel, setNextChannel] = useState<"call" | "whatsapp" | "email" | "visit">("call");
  const [optionalNext, setOptionalNext] = useState(false);
  const [meetingAt, setMeetingAt] = useState("");
  const [meetingType, setMeetingType] = useState("Demo");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [meetingDuration, setMeetingDuration] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!logCall) return;
    setDetail(null);
    setOutcome(null);
    setNotes("");
    setTemperature("");
    setNeedIdentified(false);
    setAskedPricing(false);
    setDealValue("");
    setReason("");
    setNewProducts([]);
    setProductDraft("");
    setDuration("");
    setDurationTouched(false);
    setNextDetails("");
    setOptionalNext(false);
    setMeetingAt(suggestDateTimeLocal(48));
    setMeetingType("Demo");
    setMeetingLocation("");
    setMeetingDuration(60);
    setError(null);
    api<LeadDetailDTO>(`/api/leads/${logCall.leadId}`)
      .then((d) => {
        setDetail(d);
        setProductIds(d.lead.productId ? [d.lead.productId] : []);
        setDealValue(d.lead.dealValue != null ? String(d.lead.dealValue) : "");
      })
      .catch((e) => setError(e.message));
  }, [logCall]);

  // Call timer: keeps the duration in step with the time since "Call" was pressed, until the user edits it.
  useEffect(() => {
    if (!logCall || durationTouched) return;
    const tick = () => setDuration(String(minutesSince(logCall.startedAt)));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [logCall, durationTouched]);

  const rule = outcome ? OUTCOME_RULES[outcome] : null;

  useEffect(() => {
    if (!outcome || !rule) return;
    const label = defaultNextAction(outcome);
    setNextLabel(label);
    setNextChannel(channelForAction(label));
    setNextDue(suggestDateTimeLocal(rule.suggestHours ?? 24));
  }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingFollowUp = useMemo(() => {
    if (!detail || !logCall) return null;
    return detail.followUps.find((f) => f.status === "Pending" && (!logCall.followUpId || f._id === logCall.followUpId)) ?? null;
  }, [detail, logCall]);

  const needsNext = rule?.nextAction === "required" || (outcome === "converted" && optionalNext);
  const needsReason = outcome === "not_interested";
  const reportNextAction =
    rule?.nextAction === "meeting" ? "Schedule Meeting" : needsNext ? nextLabel : outcome === "converted" ? "Deal Closed" : "No Action";

  const canSubmit =
    !!outcome &&
    !!detail &&
    !submitting &&
    (!needsNext || !!nextDue) &&
    (!needsReason || !!reason) &&
    (rule?.nextAction !== "meeting" || !!meetingAt);

  const selectedCount = productIds.length + newProducts.length;
  const addTypedProduct = () => {
    const name = productDraft.replace(/\s+/g, " ").trim();
    if (!name) return;
    const match = products.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (match) setProductIds((ids) => (ids.includes(match._id) ? ids : [...ids, match._id]));
    else setNewProducts((list) => (list.some((x) => x.toLowerCase() === name.toLowerCase()) ? list : [...list, name]));
    setProductDraft("");
  };
  const toggleProduct = (id: string) => setProductIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = async () => {
    if (!outcome || !detail || !logCall) return;
    setSubmitting(true);
    setError(null);
    try {
      const title = nextDetails.trim() ? `${nextLabel}: ${nextDetails.trim()}` : nextLabel;
      await api(`/api/leads/${detail.lead._id}/calls`, {
        body: {
          outcome,
          notes: notes || undefined,
          productIds,
          productNames: newProducts,
          durationMins: duration === "" ? null : Number(duration),
          reason: outcome === "not_interested" || outcome === "do_not_contact" ? reason || null : null,
          nextActionLabel: reportNextAction,
          temperature: rule?.captureInterest && temperature ? temperature : null,
          needIdentified: rule?.captureInterest ? needIdentified : false,
          askedPricing: rule?.captureInterest ? askedPricing : false,
          dealValue: dealValue ? Number(dealValue) : null,
          followUpId: logCall.followUpId ?? null,
          nextAction: needsNext ? { title, dueAt: new Date(nextDue).toISOString(), channel: nextChannel } : null,
          meeting:
            rule?.nextAction === "meeting"
              ? { scheduledAt: new Date(meetingAt).toISOString(), type: meetingType, location: meetingLocation, durationMins: meetingDuration }
              : null,
        },
      });
      triggerRefresh();
      closeLogCall();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const lead = detail?.lead;

  return (
    <Modal
      open={!!logCall}
      onClose={closeLogCall}
      size="lg"
      title="Log call"
      description={lead ? `${leadTitle(lead)} · ${leadSubtitle(lead)}` : "Loading lead…"}
      footer={
        <>
          <button className="btn-secondary" onClick={closeLogCall}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!canSubmit} onClick={submit}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Save call
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <ErrorNote>{error}</ErrorNote>

        {lead && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            <StageBadge stage={lead.stage} />
            <TemperatureBadge temperature={lead.temperature} score={lead.score} />
            <span>· {lead.callCount === 0 ? "New lead — first call" : `Follow-up call (${lead.callCount} before)`}</span>
            {pendingFollowUp && (
              <span className="inline-flex items-center gap-1">
                · <CalendarClock size={12} /> {pendingFollowUp.title} ({formatDue(pendingFollowUp.dueAt)})
              </span>
            )}
            {lead.doNotContact && <span className="font-semibold text-critical-500">· Do not contact</span>}
          </div>
        )}

        <div>
          <label className="label">Call status / outcome</label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CALL_OUTCOMES.map((o) => {
              const r = OUTCOME_RULES[o];
              return (
                <button
                  key={o}
                  type="button"
                  data-on={outcome === o}
                  onClick={() => setOutcome(o)}
                  className={cn(
                    "rounded-lg border border-surface-border px-2.5 py-2 text-left text-sm text-ink-secondary ring-2 ring-transparent transition-colors hover:bg-surface-hover/5",
                    toneRing[r.tone]
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {outcome && (
            <p className="mt-1.5 text-[11px] text-ink-muted">
              Report: <span className="text-ink-secondary">{callStatusFor(outcome)}</span>
              {leadTypeFor(outcome) && (
                <>
                  {" "}· <span className="text-ink-secondary">{leadTypeFor(outcome)}</span>
                </>
              )}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr]">
          <div>
            <label className="label flex items-center gap-1">
              <Timer size={11} /> Duration (mins)
            </label>
            <input
              className="input tabular-nums"
              inputMode="decimal"
              value={duration}
              onChange={(e) => {
                setDurationTouched(true);
                setDuration(e.target.value.replace(/[^\d.]/g, ""));
              }}
            />
            {!durationTouched && <p className="mt-1 text-[10px] text-ink-muted">Timing since you pressed Call</p>}
          </div>
          {rule?.connected && (
            <div>
              <label className="label">Product interested in</label>
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => toggleProduct(p._id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      productIds.includes(p._id) ? "border-primary-600 bg-primary-500/10 text-primary-700 dark:text-primary-300" : "border-surface-border text-ink-muted hover:text-ink"
                    )}
                  >
                    {p.name}
                  </button>
                ))}
                {newProducts.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNewProducts((list) => list.filter((x) => x !== n))}
                    className="rounded-full border border-primary-600 bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-primary-700 dark:text-primary-300"
                    title="Tap to remove"
                  >
                    {n} ✕
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  className="input !py-1.5"
                  value={productDraft}
                  onChange={(e) => setProductDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTypedProduct();
                    }
                  }}
                  placeholder={products.length ? "Another product? Type it" : "Type the product discussed"}
                  enterKeyHint="done"
                />
                <button type="button" className="btn-secondary !py-1.5" disabled={!productDraft.trim()} onClick={addTypedProduct}>
                  Add
                </button>
              </div>
              <p className="mt-1 text-[10px] text-ink-muted">
                {selectedCount === 0 ? "None" : selectedCount === 1 ? "One product" : "Multiple Products"} — pick or type all that were discussed.
              </p>
            </div>
          )}
        </div>

        {rule?.captureInterest && (
          <div className="space-y-3 rounded-lg border border-surface-border bg-surface-inset/60 p-3">
            <div>
              <label className="label">Hot / Warm / Cold</label>
              <div className="flex max-w-sm gap-1.5">
                {TEMPERATURES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTemperature(temperature === t ? "" : t)}
                    className={cn("btn-secondary flex-1 !py-1.5", temperature === t && "!border-primary-600 !bg-primary-500/10 text-primary-700 dark:text-primary-300")}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {!temperature && <p className="mt-1 text-[10px] text-ink-muted">Leave blank to use the lead score.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-secondary">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={needIdentified} onChange={(e) => setNeedIdentified(e.target.checked)} /> Identified a need
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={askedPricing} onChange={(e) => setAskedPricing(e.target.checked)} /> Asked for pricing
              </label>
              <label className="flex items-center gap-2">
                Est. deal value
                <input className="input !w-28 !py-1" inputMode="numeric" value={dealValue} onChange={(e) => setDealValue(e.target.value.replace(/[^\d.]/g, ""))} />
              </label>
            </div>
          </div>
        )}

        {(outcome === "not_interested" || outcome === "do_not_contact") && (
          <div>
            <label className="label">Reason (if not interested){needsReason && " *"}</label>
            <div className="flex flex-wrap gap-1.5">
              {NOT_INTERESTED_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(reason === r ? "" : r)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium",
                    reason === r ? "border-critical-500 bg-critical-500/10 text-critical-600 dark:text-critical-500" : "border-surface-border text-ink-muted hover:text-ink"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="label">Remarks</label>
          <textarea className="input min-h-[64px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed, objections, who to ask for next time…" />
        </div>

        {rule?.nextAction === "meeting" && (
          <div className="space-y-3 rounded-lg border border-primary-500/30 bg-primary-500/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <CalendarPlus size={15} /> Next action: Schedule Meeting
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Date & time</label>
                <input type="datetime-local" className="input" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} />
              </div>
              <div>
                <label className="label">Type</label>
                <select className="input" value={meetingType} onChange={(e) => setMeetingType(e.target.value)}>
                  {["Demo", "Discovery", "Proposal Review", "Negotiation", "Other"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Location / link</label>
                <input className="input" value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} placeholder="Client office, Google Meet link…" />
              </div>
              <div>
                <label className="label">Duration (min)</label>
                <input type="number" className="input" value={meetingDuration} onChange={(e) => setMeetingDuration(Number(e.target.value) || 60)} />
              </div>
            </div>
          </div>
        )}

        {rule && rule.nextAction !== "meeting" && (
          <div className={cn("space-y-3 rounded-lg border p-3", needsNext ? "border-primary-500/30 bg-primary-500/5" : "border-surface-border")}>
            {rule.nextAction === "required" ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <CalendarClock size={15} /> Next action & follow-up date <span className="text-xs font-normal text-ink-muted">— required</span>
              </p>
            ) : outcome === "converted" ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-healthy-700 dark:text-healthy-500">Next action: Deal Closed</p>
                <label className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input type="checkbox" checked={optionalNext} onChange={(e) => setOptionalNext(e.target.checked)} />
                  Also schedule an onboarding / handover follow-up
                </label>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Next action: <span className="text-ink-secondary">No Action</span> —{" "}
                {outcome === "wrong_number"
                  ? "the number will be flagged invalid. Update it on the lead if you find the right one."
                  : outcome === "do_not_contact"
                    ? "the lead will be closed and blocked from further calls."
                    : "the lead will be marked Lost."}
              </p>
            )}
            {needsNext && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_190px_120px]">
                <div>
                  <label className="label">Next action</label>
                  <select
                    className="input"
                    value={nextLabel}
                    onChange={(e) => {
                      setNextLabel(e.target.value);
                      setNextChannel(channelForAction(e.target.value));
                    }}
                  >
                    {FOLLOW_UP_ACTIONS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <input className="input mt-1.5 !py-1.5 sm:!text-xs" value={nextDetails} onChange={(e) => setNextDetails(e.target.value)} placeholder="Details (optional) — e.g. VisitFlow pricing" />
                </div>
                <div>
                  <label className="label">Follow-up date</label>
                  <input type="datetime-local" className="input" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
                </div>
                <div>
                  <label className="label">How</label>
                  <select className="input" value={nextChannel} onChange={(e) => setNextChannel(e.target.value as any)}>
                    <option value="call">Call</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="visit">Visit</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        )}

        {!outcome && (
          <p className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Phone size={12} /> Pick what happened — the lead's stage, score, next action and the daily report update automatically.
          </p>
        )}
      </div>
    </Modal>
  );
}
