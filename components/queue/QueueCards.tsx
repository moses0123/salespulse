"use client";

import { useState } from "react";
import { Clock, RotateCcw, Check, CalendarPlus, MapPin } from "lucide-react";
import { useUI } from "@/context/UIContext";
import ContactActions from "@/components/leads/ContactActions";
import { StageBadge, TemperatureBadge, OutcomeText } from "@/components/ui/StatusBadge";
import { api } from "@/lib/client";
import { leadTitle, leadSubtitle } from "@/lib/sales";
import { cn, formatDue, formatOverdueDuration, timeAgo, suggestDateTimeLocal } from "@/lib/utils";
import type { FollowUpDTO, LeadDTO, MeetingDTO } from "@/lib/types";

export function FollowUpCard({ f, showAssignee }: { f: FollowUpDTO; showAssignee?: boolean }) {
  const { openLead, triggerRefresh } = useUI();
  const [resched, setResched] = useState(false);
  const [to, setTo] = useState("");
  const overdue = new Date(f.dueAt) < new Date();
  if (!f.lead) return null;
  const lead = f.lead;

  const patch = async (body: unknown) => {
    await api(`/api/follow-ups/${f._id}`, { method: "PATCH", body });
    setResched(false);
    triggerRefresh();
  };

  return (
    <div className={cn("panel p-3", overdue && "border-critical-500/40")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => openLead(f.leadId)}>
          <p className="truncate font-medium text-ink hover:underline">{leadTitle(lead)}</p>
          <p className="truncate text-xs text-ink-muted">
            {leadSubtitle(lead)}
            {lead.industry ? ` · ${lead.industry}` : ""}
          </p>
        </button>
        <div className="flex items-center gap-1.5">
          <StageBadge stage={lead.stage} />
          <TemperatureBadge temperature={lead.temperature} />
        </div>
      </div>
      <p className={cn("mt-2 flex items-center gap-1.5 text-sm", overdue ? "text-critical-600 dark:text-critical-500" : "text-ink-secondary")}>
        <Clock size={13} />
        <span className="font-medium">{f.title}</span>
        <span className="text-xs">
          · {formatDue(f.dueAt)}
          {overdue && ` · ${formatOverdueDuration(f.dueAt)}`}
          {f.channel !== "call" && ` · via ${f.channel}`}
          {showAssignee && f.assignee && ` · ${f.assignee.name}`}
          {f.rescheduleCount > 0 && ` · rescheduled ${f.rescheduleCount}×`}
        </span>
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <ContactActions lead={{ ...lead, product: null }} followUpId={f._id} />
        {resched ? (
          <span className="flex items-center gap-1">
            <input type="datetime-local" className="input !w-44 !py-1 !text-xs" value={to} onChange={(e) => setTo(e.target.value)} />
            <button className="btn-primary !px-2 !py-1 text-xs" disabled={!to} onClick={() => patch({ action: "reschedule", dueAt: new Date(to).toISOString() })}>
              Save
            </button>
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setResched(false)}>Cancel</button>
          </span>
        ) : (
          <>
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setTo(suggestDateTimeLocal(24)); setResched(true); }}>
              <RotateCcw size={12} /> Reschedule
            </button>
            <button className="btn-ghost !px-2 !py-1 text-xs" title="Done without a call (e.g. WhatsApp/email sent)" onClick={() => patch({ action: "complete" })}>
              <Check size={12} /> Complete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function LeadCard({ lead }: { lead: LeadDTO }) {
  const { openLead } = useUI();
  return (
    <div className="panel p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => openLead(lead._id)}>
          <p className="truncate font-medium text-ink hover:underline">{leadTitle(lead)}</p>
          <p className="truncate text-xs text-ink-muted">
            {leadSubtitle(lead)}
            {lead.industry ? ` · ${lead.industry}` : ""}
            {lead.product ? ` · ${lead.product.name}` : ""}
          </p>
        </button>
        <div className="flex items-center gap-1.5">
          <StageBadge stage={lead.stage} />
          <TemperatureBadge temperature={lead.temperature} score={lead.score} />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-ink-muted">
        {lead.lastOutcome ? <>Last: <OutcomeText outcome={lead.lastOutcome} /> · {lead.lastContactAt && timeAgo(lead.lastContactAt)}</> : `Never called · ${lead.source}`}
      </p>
      <div className="mt-2.5">
        <ContactActions lead={lead} disabled={lead.doNotContact} />
      </div>
    </div>
  );
}

export function MeetingCard({ m, showOwner }: { m: MeetingDTO; showOwner?: boolean }) {
  const { openLead, openMeetingOutcome } = useUI();
  const past = new Date(m.scheduledAt) < new Date();
  if (!m.lead) return null;
  return (
    <div className={cn("panel p-3", past && m.status === "Scheduled" && "border-attention-500/40")}>
      <div className="flex items-start justify-between gap-2">
        <button className="min-w-0 text-left" onClick={() => openLead(m.leadId)}>
          <p className="truncate font-medium text-ink hover:underline">{leadTitle(m.lead)}</p>
          <p className="truncate text-xs text-ink-muted">
            {leadSubtitle(m.lead)}
          </p>
        </button>
        <span className="badge bg-primary-500/10 text-primary-700 ring-1 ring-primary-500/25 dark:text-primary-300">
          <CalendarPlus size={11} /> {m.type}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink-secondary">
        <span className="font-medium">{formatDue(m.scheduledAt)}</span>
        <span className="text-xs text-ink-muted">
          {" "}· {m.durationMins} min{m.product ? ` · ${m.product.name}` : ""}
          {showOwner && m.owner ? ` · ${m.owner.name}` : ""}
        </span>
      </p>
      {m.location && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
          <MapPin size={11} /> {m.location}
        </p>
      )}
      {m.status === "Scheduled" ? (
        <button className={cn("mt-2.5 !px-2 !py-1 text-xs", past ? "btn-primary" : "btn-secondary")} onClick={() => openMeetingOutcome(m._id)}>
          Record outcome{past ? " (overdue)" : ""}
        </button>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">{m.status === "Completed" ? `Outcome: ${m.outcome?.replace(/_/g, " ")}` : "Cancelled"} {m.outcomeNotes && `— ${m.outcomeNotes}`}</p>
      )}
    </div>
  );
}

