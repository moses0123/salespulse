"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Phone, CalendarClock, CalendarPlus, CheckCircle2 } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useProducts } from "@/hooks/useCatalog";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import { StageBadge, TemperatureBadge } from "@/components/ui/StatusBadge";
import { api } from "@/lib/client";
import { cn, suggestDateTimeLocal, formatDue } from "@/lib/utils";
import { CALL_OUTCOMES, OUTCOME_RULES, TEMPERATURES, leadTitle, leadSubtitle, type CallOutcome, type Temperature } from "@/lib/sales";
import type { LeadDetailDTO } from "@/lib/types";

const toneRing = {
  neutral: "data-[on=true]:ring-ink-muted data-[on=true]:bg-surface-hover/10",
  negative: "data-[on=true]:ring-critical-500 data-[on=true]:bg-critical-500/10",
  positive: "data-[on=true]:ring-primary-600 data-[on=true]:bg-primary-500/10",
  win: "data-[on=true]:ring-healthy-500 data-[on=true]:bg-healthy-500/10",
};

/** After every call: pick the outcome → capture interest → set the next action. */
export default function LogCallModal() {
  const { logCall, closeLogCall, triggerRefresh } = useUI();
  const products = useProducts();
  const [detail, setDetail] = useState<LeadDetailDTO | null>(null);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [temperature, setTemperature] = useState<Temperature | "">("");
  const [needIdentified, setNeedIdentified] = useState(false);
  const [askedPricing, setAskedPricing] = useState(false);
  const [dealValue, setDealValue] = useState("");
  const [nextTitle, setNextTitle] = useState("");
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
    setOptionalNext(false);
    setMeetingAt(suggestDateTimeLocal(48));
    setMeetingType("Demo");
    setMeetingLocation("");
    setMeetingDuration(60);
    setError(null);
    api<LeadDetailDTO>(`/api/leads/${logCall.leadId}`)
      .then((d) => {
        setDetail(d);
        setProductId(d.lead.productId ?? "");
        setDealValue(d.lead.dealValue != null ? String(d.lead.dealValue) : "");
      })
      .catch((e) => setError(e.message));
  }, [logCall]);

  const rule = outcome ? OUTCOME_RULES[outcome] : null;

  useEffect(() => {
    if (!rule) return;
    setNextTitle(rule.defaultFollowUp ?? "Follow up");
    setNextDue(suggestDateTimeLocal(rule.suggestHours ?? 24));
  }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingFollowUp = useMemo(() => {
    if (!detail || !logCall) return null;
    return detail.followUps.find((f) => f.status === "Pending" && (!logCall.followUpId || f._id === logCall.followUpId)) ?? null;
  }, [detail, logCall]);

  const needsNext = rule?.nextAction === "required" || (rule?.nextAction === "none" && outcome === "converted" && optionalNext);
  const canSubmit =
    !!outcome && !!detail && !submitting && (!needsNext || (nextTitle.trim() && nextDue)) && (rule?.nextAction !== "meeting" || meetingAt);

  const submit = async () => {
    if (!outcome || !detail || !logCall) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/api/leads/${detail.lead._id}/calls`, {
        body: {
          outcome,
          notes: notes || undefined,
          productId: productId || null,
          temperature: rule?.captureInterest && temperature ? temperature : null,
          needIdentified: rule?.captureInterest ? needIdentified : false,
          askedPricing: rule?.captureInterest ? askedPricing : false,
          dealValue: dealValue ? Number(dealValue) : null,
          followUpId: logCall.followUpId ?? null,
          nextAction: needsNext ? { title: nextTitle, dueAt: new Date(nextDue).toISOString(), channel: nextChannel } : null,
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
      title="Log call outcome"
      description={lead ? `${leadTitle(lead)} · ${leadSubtitle(lead)}` : "Loading lead…"}
      footer={
        <>
          <button className="btn-secondary" onClick={closeLogCall}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!canSubmit} onClick={submit}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Save outcome
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
            <span>· {lead.callCount} previous call{lead.callCount === 1 ? "" : "s"}</span>
            {pendingFollowUp && (
              <span className="inline-flex items-center gap-1">
                · <CalendarClock size={12} /> {pendingFollowUp.title} ({formatDue(pendingFollowUp.dueAt)})
              </span>
            )}
            {lead.doNotContact && <span className="font-semibold text-critical-500">· Do not contact</span>}
          </div>
        )}

        <div>
          <label className="label">What happened?</label>
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
        </div>

        {rule?.captureInterest && (
          <div className="space-y-3 rounded-lg border border-surface-border bg-surface-inset/60 p-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Product of interest</label>
                <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
                  <option value="">—</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Interest level</label>
                <div className="flex gap-1.5">
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
              </div>
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

        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was discussed, objections, who to ask for next time…" />
        </div>

        {rule?.nextAction === "meeting" && (
          <div className="space-y-3 rounded-lg border border-primary-500/30 bg-primary-500/5 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
              <CalendarPlus size={15} /> Meeting details
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
                <CalendarClock size={15} /> Next action <span className="text-xs font-normal text-ink-muted">— required</span>
              </p>
            ) : outcome === "converted" ? (
              <label className="flex items-center gap-2 text-sm text-ink-secondary">
                <input type="checkbox" checked={optionalNext} onChange={(e) => setOptionalNext(e.target.checked)} />
                Schedule an onboarding / handover follow-up
              </label>
            ) : (
              <p className="text-sm text-ink-muted">
                {outcome === "wrong_number"
                  ? "The number will be flagged invalid. Update it on the lead if you find the right one."
                  : outcome === "do_not_contact"
                    ? "The lead will be closed and blocked from further calls."
                    : "The lead will be marked Lost. No next action needed."}
              </p>
            )}
            {needsNext && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_120px]">
                <div>
                  <label className="label">What</label>
                  <input className="input" value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} />
                </div>
                <div>
                  <label className="label">When</label>
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
            <Phone size={12} /> Pick an outcome — the lead's stage, score and next action update automatically.
          </p>
        )}
      </div>
    </Modal>
  );
}
