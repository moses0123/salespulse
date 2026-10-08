"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUI } from "@/context/UIContext";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import { api } from "@/lib/client";
import { cn, suggestDateTimeLocal } from "@/lib/utils";
import { MEETING_OUTCOMES, MEETING_OUTCOME_RULES, type MeetingOutcome } from "@/lib/sales";

export default function MeetingOutcomeModal() {
  const { meetingOutcomeId, closeMeetingOutcome, triggerRefresh } = useUI();
  const [outcome, setOutcome] = useState<MeetingOutcome | null>(null);
  const [notes, setNotes] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [nextTitle, setNextTitle] = useState("");
  const [nextDue, setNextDue] = useState("");
  const [rescheduleTo, setRescheduleTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingOutcomeId) return;
    setOutcome(null);
    setNotes("");
    setDealValue("");
    setRescheduleTo(suggestDateTimeLocal(48));
    setError(null);
  }, [meetingOutcomeId]);

  const rule = outcome ? MEETING_OUTCOME_RULES[outcome] : null;
  useEffect(() => {
    if (rule?.defaultFollowUp) {
      setNextTitle(rule.defaultFollowUp);
      setNextDue(suggestDateTimeLocal(48));
    }
  }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = !!outcome && !busy && (rule?.nextAction !== "required" || (nextTitle && nextDue)) && (rule?.nextAction !== "reschedule" || rescheduleTo);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/meetings/${meetingOutcomeId}`, {
        method: "PATCH",
        body: {
          action: "outcome",
          outcome,
          notes,
          dealValue: dealValue ? Number(dealValue) : null,
          nextAction: rule?.nextAction === "required" ? { title: nextTitle, dueAt: new Date(nextDue).toISOString() } : null,
          rescheduleTo: rule?.nextAction === "reschedule" ? new Date(rescheduleTo).toISOString() : null,
        },
      });
      triggerRefresh();
      closeMeetingOutcome();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelMeeting = async () => {
    setBusy(true);
    try {
      await api(`/api/meetings/${meetingOutcomeId}`, { method: "PATCH", body: { action: "cancel", reason: notes } });
      triggerRefresh();
      closeMeetingOutcome();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!meetingOutcomeId}
      onClose={closeMeetingOutcome}
      title="Meeting outcome"
      footer={
        <>
          <button className="btn-ghost mr-auto text-critical-600" onClick={cancelMeeting} disabled={busy}>Cancel meeting</button>
          <button className="btn-secondary" onClick={closeMeetingOutcome}>Close</button>
          <button className="btn-primary" disabled={!canSubmit} onClick={submit}>
            {busy && <Loader2 size={14} className="animate-spin" />} Save outcome
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {MEETING_OUTCOMES.map((o) => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className={cn(
                "rounded-lg border border-surface-border px-2.5 py-2 text-left text-sm text-ink-secondary hover:bg-surface-hover/5",
                outcome === o && "border-primary-600 bg-primary-500/10 text-ink"
              )}
            >
              {MEETING_OUTCOME_RULES[o].label}
            </button>
          ))}
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[70px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {(outcome === "proposal_requested" || outcome === "negotiation" || outcome === "converted") && (
          <div>
            <label className="label">Deal value</label>
            <input className="input" inputMode="numeric" value={dealValue} onChange={(e) => setDealValue(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
        )}
        {rule?.nextAction === "required" && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-primary-500/30 bg-primary-500/5 p-3 sm:grid-cols-[1fr_190px]">
            <div>
              <label className="label">Next action (required)</label>
              <input className="input" value={nextTitle} onChange={(e) => setNextTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">When</label>
              <input type="datetime-local" className="input" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
            </div>
          </div>
        )}
        {rule?.nextAction === "reschedule" && (
          <div>
            <label className="label">New date & time</label>
            <input type="datetime-local" className="input" value={rescheduleTo} onChange={(e) => setRescheduleTo(e.target.value)} />
          </div>
        )}
      </div>
    </Modal>
  );
}
