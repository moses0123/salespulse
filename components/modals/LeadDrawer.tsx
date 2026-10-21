"use client";

import { useCallback, useEffect, useState } from "react";
import {
  X, Mail, Globe, MapPin, Building2, CalendarClock, CalendarPlus, StickyNote, Pencil, Loader2, Ban, Trophy,
  XCircle, FileText, PhoneCall, MessageCircle, ArrowRightLeft, Clock, Check, RotateCcw, UserRound, Activity as ActivityIcon,
} from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useProducts, useFacets } from "@/hooks/useCatalog";
import { useUsers } from "@/hooks/useUsers";
import ContactActions from "@/components/leads/ContactActions";
import ProductInput from "@/components/leads/ProductInput";
import { StageBadge, TemperatureBadge, OutcomeText } from "@/components/ui/StatusBadge";
import ErrorNote from "@/components/ui/ErrorNote";
import Avatar from "@/components/ui/Avatar";
import { api } from "@/lib/client";
import { cn, formatDue, formatDateTimeShort, timeAgo, formatMoney, toDateTimeLocalValue } from "@/lib/utils";
import { LEAD_STAGES, LEAD_SOURCES, MEETING_OUTCOME_RULES, leadTitle, type LeadStage } from "@/lib/sales";
import type { LeadDetailDTO, ActivityDTO } from "@/lib/types";

const activityIcon: Record<string, typeof PhoneCall> = {
  call: PhoneCall,
  whatsapp: MessageCircle,
  email: Mail,
  note: StickyNote,
  follow_up_created: CalendarClock,
  follow_up_completed: Check,
  follow_up_rescheduled: RotateCcw,
  meeting_booked: CalendarPlus,
  meeting_outcome: CalendarPlus,
  meeting_rescheduled: RotateCcw,
  stage_change: ArrowRightLeft,
  proposal_sent: FileText,
  assigned: UserRound,
  lead_created: Building2,
  imported: Building2,
};

function TimelineItem({ a }: { a: ActivityDTO }) {
  const Icon = activityIcon[a.type] ?? ActivityIcon;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      <div className="absolute left-[13px] top-7 bottom-0 w-px bg-surface-border" aria-hidden />
      <div className={cn("z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-inset ring-1 ring-surface-border", a.type === "call" && a.connected && "text-primary-600")}>
        <Icon size={13} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-sm text-ink-secondary">
          {a.summary}
          {a.outcome && a.type === "call" && <span className="sr-only"> ({a.outcome})</span>}
        </p>
        {a.notes && <p className="mt-0.5 whitespace-pre-line text-xs text-ink-muted">{a.notes}</p>}
        <p className="mt-0.5 text-[11px] text-ink-muted">
          {formatDateTimeShort(a.createdAt)} · {a.user?.name ?? "System"}
        </p>
      </div>
    </li>
  );
}

export default function LeadDrawer() {
  const { leadDrawerId, closeLead, refreshKey, triggerRefresh, openFollowUp, openBookMeeting, openMeetingOutcome } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role === "admin" || currentUser?.role === "manager";
  const products = useProducts(refreshKey);
  const facets = useFacets();
  const { users } = useUsers(undefined, { activeOnly: true });

  const [detail, setDetail] = useState<LeadDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [askLost, setAskLost] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleTo, setRescheduleTo] = useState("");

  const load = useCallback(async () => {
    if (!leadDrawerId) return;
    try {
      setDetail(await api<LeadDetailDTO>(`/api/leads/${leadDrawerId}`));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [leadDrawerId]);

  useEffect(() => {
    if (!leadDrawerId) {
      setDetail(null);
      setEditing(false);
      setAskLost(false);
      return;
    }
    load();
  }, [leadDrawerId, refreshKey, load]);

  useEffect(() => {
    if (!leadDrawerId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[role="dialog"]') && closeLead();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [leadDrawerId, closeLead]);

  if (!leadDrawerId) return null;
  const lead = detail?.lead;

  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      triggerRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = () => {
    if (!lead) return;
    setForm({
      name: lead.name,
      companyName: lead.companyName ?? "",
      phone: lead.phone,
      email: lead.email ?? "",
      industry: lead.industry ?? "",
      location: lead.location ?? "",
      website: lead.website ?? "",
      productName: lead.product?.name ?? "",
      source: lead.source,
      dealValue: lead.dealValue ?? "",
      notes: lead.notes ?? "",
    });
    setEditing(true);
  };

  const saveEdit = () =>
    run(async () => {
      await api(`/api/leads/${leadDrawerId}`, {
        method: "PATCH",
        body: { ...form, productName: (form.productName ?? "").trim(), dealValue: form.dealValue === "" ? null : Number(form.dealValue) },
      });
      setEditing(false);
    });

  const setStage = (stage: LeadStage, extra: Record<string, unknown> = {}) =>
    run(() => api(`/api/leads/${leadDrawerId}/stage`, { method: "PATCH", body: { stage, ...extra } }));

  const pendingFollowUps = detail?.followUps.filter((f) => f.status === "Pending") ?? [];
  const scheduledMeetings = detail?.meetings.filter((m) => m.status === "Scheduled") ?? [];
  const closed = lead?.stage === "Won" || lead?.stage === "Lost";
  const field = (k: string, label: string, opts: { type?: string; list?: string } = {}) => (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={opts.type} list={opts.list} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end animate-fade-in">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" onClick={closeLead} />
      <aside className="relative flex h-full w-full max-w-2xl flex-col panel rounded-none border-l animate-slide-in">
        <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div className="min-w-0">
            {lead ? (
              <>
                <h2 className="truncate text-lg font-semibold text-ink">{leadTitle(lead)}</h2>
                <p className="text-sm text-ink-muted">
                  {lead.name && lead.companyName ? `${lead.companyName} · ` : ""}
                  <span className={cn(!lead.phoneValid && "text-critical-500 line-through")}>{lead.phone}</span>
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StageBadge stage={lead.stage} />
                  <TemperatureBadge temperature={lead.temperature} score={lead.score} />
                  {lead.doNotContact && (
                    <span className="badge bg-critical-500/10 text-critical-600 ring-1 ring-critical-500/30">
                      <Ban size={11} /> Do not contact
                    </span>
                  )}
                  {lead.product && <span className="badge bg-surface-hover/5 text-ink-secondary ring-1 ring-surface-border">{lead.product.name}</span>}
                </div>
              </>
            ) : (
              <div className="h-12 w-60 animate-pulse rounded bg-surface-hover/5" />
            )}
          </div>
          <button onClick={closeLead} className="btn-ghost !p-1.5" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <ErrorNote>{error}</ErrorNote>
          {lead && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <ContactActions lead={lead} showView={false} size="md" disabled={lead.doNotContact} followUpId={pendingFollowUps[0]?._id} />
                <button className="btn-secondary" onClick={() => openFollowUp(lead._id)} disabled={closed}>
                  <CalendarClock size={14} /> Follow-up
                </button>
                <button className="btn-secondary" onClick={() => openBookMeeting(lead._id)} disabled={lead.doNotContact}>
                  <CalendarPlus size={14} /> Meeting
                </button>
              </div>

              {/* Next action — the design principle: every open lead has one */}
              <div
                className={cn(
                  "rounded-lg border px-3.5 py-3",
                  !closed && !lead.nextActionAt && lead.stage !== "New" ? "border-attention-500/40 bg-attention-500/5" : "border-surface-border bg-surface-inset/50"
                )}
              >
                <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Next action</p>
                {lead.nextActionAt ? (
                  <p className={cn("mt-0.5 text-sm font-medium", new Date(lead.nextActionAt) < new Date() ? "text-critical-600 dark:text-critical-500" : "text-ink")}>
                    {lead.nextActionTitle} — {formatDue(lead.nextActionAt)}
                    {new Date(lead.nextActionAt) < new Date() && " (overdue)"}
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-ink-secondary">
                    {closed ? `Closed — ${lead.stage}${lead.lostReason ? ` (${lead.lostReason})` : ""}` : lead.stage === "New" ? "Not contacted yet — make the first call." : "None scheduled — set a follow-up so this lead doesn't go cold."}
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-muted">
                  Owner: {lead.assignee?.name ?? "Unassigned"} · Last contact: {lead.lastContactAt ? timeAgo(lead.lastContactAt) : "never"} · {lead.callCount} call
                  {lead.callCount === 1 ? "" : "s"}
                  {lead.lastOutcome && (
                    <>
                      {" "}· last: <OutcomeText outcome={lead.lastOutcome} />
                    </>
                  )}
                </p>
              </div>

              {pendingFollowUps.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Open follow-ups</h3>
                  <ul className="space-y-1.5">
                    {pendingFollowUps.map((f) => (
                      <li key={f._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm">
                        <Clock size={13} className={new Date(f.dueAt) < new Date() ? "text-critical-500" : "text-ink-muted"} />
                        <span className="flex-1 text-ink-secondary">
                          {f.title} — <span className={cn(new Date(f.dueAt) < new Date() && "font-medium text-critical-600 dark:text-critical-500")}>{formatDue(f.dueAt)}</span>
                          <span className="text-ink-muted"> · {f.assignee?.name}</span>
                        </span>
                        {rescheduleId === f._id ? (
                          <span className="flex items-center gap-1">
                            <input type="datetime-local" className="input !w-48 !py-1 sm:!text-xs" value={rescheduleTo} onChange={(e) => setRescheduleTo(e.target.value)} />
                            <button
                              className="btn-primary !px-2 !py-1 text-xs"
                              disabled={!rescheduleTo || saving}
                              onClick={() =>
                                run(async () => {
                                  await api(`/api/follow-ups/${f._id}`, { method: "PATCH", body: { action: "reschedule", dueAt: new Date(rescheduleTo).toISOString() } });
                                  setRescheduleId(null);
                                })
                              }
                            >
                              Save
                            </button>
                            <button className="btn-ghost !p-1" onClick={() => setRescheduleId(null)}>
                              <X size={12} />
                            </button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <button
                              className="btn-ghost !px-2 !py-1 text-xs"
                              onClick={() => {
                                setRescheduleId(f._id);
                                setRescheduleTo(toDateTimeLocalValue(new Date(Math.max(Date.now() + 3600_000, new Date(f.dueAt).getTime()))));
                              }}
                            >
                              <RotateCcw size={12} /> Reschedule
                            </button>
                            <button
                              className="btn-ghost !px-2 !py-1 text-xs"
                              title="Mark done without a call (e.g. WhatsApp sent)"
                              onClick={() => run(() => api(`/api/follow-ups/${f._id}`, { method: "PATCH", body: { action: "complete", note: "Completed from lead" } }))}
                            >
                              <Check size={12} /> Done
                            </button>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {scheduledMeetings.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Meetings</h3>
                  <ul className="space-y-1.5">
                    {scheduledMeetings.map((m) => (
                      <li key={m._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm">
                        <CalendarPlus size={13} className="text-primary-600" />
                        <span className="flex-1 text-ink-secondary">
                          {m.type} — {formatDue(m.scheduledAt)}
                          {m.location && <span className="text-ink-muted"> · {m.location}</span>}
                          <span className="text-ink-muted"> · {m.owner?.name}</span>
                        </span>
                        <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => openMeetingOutcome(m._id)}>
                          Record outcome
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Pipeline controls */}
              <section className="flex flex-wrap items-center gap-2">
                <select
                  className="input !w-auto !py-1.5"
                  value={lead.stage}
                  onChange={(e) => {
                    const s = e.target.value as LeadStage;
                    if (s === "Lost") setAskLost(true);
                    else setStage(s);
                  }}
                  disabled={saving}
                  aria-label="Move stage"
                >
                  {LEAD_STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                {!closed && lead.stage !== "Proposal Sent" && (
                  <button className="btn-ghost text-xs" onClick={() => setStage("Proposal Sent")} disabled={saving}>
                    <FileText size={13} /> Proposal sent
                  </button>
                )}
                {lead.stage !== "Won" && (
                  <button className="btn-ghost text-xs text-healthy-700 dark:text-healthy-500" onClick={() => setStage("Won")} disabled={saving}>
                    <Trophy size={13} /> Won
                  </button>
                )}
                {lead.stage !== "Lost" && (
                  <button className="btn-ghost text-xs text-critical-600 dark:text-critical-500" onClick={() => setAskLost(true)} disabled={saving}>
                    <XCircle size={13} /> Lost
                  </button>
                )}
                {isMgr && (
                  <select
                    className="input ml-auto !w-auto !py-1.5"
                    value={lead.assignedTo ?? ""}
                    onChange={(e) =>
                      run(() =>
                        api("/api/leads/assign", {
                          body: e.target.value ? { leadIds: [lead._id], mode: "user", userIds: [e.target.value] } : { leadIds: [lead._id], mode: "unassign" },
                        })
                      )
                    }
                    aria-label="Assigned to"
                  >
                    <option value="">Unassigned</option>
                    {users.filter((u) => u.role !== "admin" || u._id === lead.assignedTo).map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
              </section>
              {askLost && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-critical-500/30 bg-critical-500/5 p-3">
                  <input className="input flex-1" autoFocus placeholder="Why was it lost? (price, competitor, no budget…)" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
                  <button
                    className="btn-primary !bg-critical-600"
                    disabled={!lostReason.trim() || saving}
                    onClick={() => setStage("Lost", { lostReason }).then(() => setAskLost(false))}
                  >
                    Mark lost
                  </button>
                  <button className="btn-ghost" onClick={() => setAskLost(false)}>
                    Cancel
                  </button>
                </div>
              )}

              {/* Details */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Details</h3>
                  {!editing ? (
                    <button className="btn-ghost !px-2 !py-1 text-xs" onClick={startEdit}>
                      <Pencil size={12} /> Edit
                    </button>
                  ) : (
                    <span className="flex gap-1">
                      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(false)}>
                        Cancel
                      </button>
                      <button className="btn-primary !px-2 !py-1 text-xs" onClick={saveEdit} disabled={saving}>
                        {saving && <Loader2 size={12} className="animate-spin" />} Save
                      </button>
                    </span>
                  )}
                </div>
                {editing ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {field("name", "Lead name *")}
                    {field("phone", "Phone *")}
                    {field("companyName", "Company")}
                    {field("email", "Email", { type: "email" })}
                    {field("industry", "Industry", { list: "dl-industries" })}
                    {field("location", "Location", { list: "dl-locations" })}
                    {field("website", "Website")}
                    <div className="sm:col-span-2">
                      <label className="label">Product</label>
                      <ProductInput value={form.productName ?? ""} onChange={(v) => setForm({ ...form, productName: v })} products={products} />
                    </div>
                    <div>
                      <label className="label">Source</label>
                      <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                        {LEAD_SOURCES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    {field("dealValue", "Est. deal value", { type: "number" })}
                    <div className="sm:col-span-2">
                      <label className="label">Notes</label>
                      <textarea className="input min-h-[70px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    <datalist id="dl-industries">{facets.industries.map((i) => <option key={i} value={i} />)}</datalist>
                    <datalist id="dl-locations">{facets.locations.map((i) => <option key={i} value={i} />)}</datalist>
                  </div>
                ) : (
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    {[
                      [Building2, "Company", lead.companyName],
                      [Building2, "Industry", lead.industry],
                      [MapPin, "Location", lead.location],
                      [Mail, "Email", lead.email ? <a className="text-primary-600 hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : null],
                      [Globe, "Website", lead.website ? <a className="text-primary-600 hover:underline" target="_blank" rel="noreferrer" href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}>{lead.website}</a> : null],
                      [UserRound, "Source", lead.source],
                      [Trophy, "Deal value", lead.dealValue != null ? formatMoney(lead.dealValue) : null],
                    ].map(([Icon, label, value]: any) => (
                      <div key={label} className="flex items-center gap-2 min-w-0">
                        <Icon size={13} className="shrink-0 text-ink-muted" />
                        <dt className="sr-only">{label}</dt>
                        <dd className="truncate text-ink-secondary">{value || <span className="text-ink-muted">No {label.toLowerCase()}</span>}</dd>
                      </div>
                    ))}
                    {lead.notes && <p className="whitespace-pre-line text-ink-secondary sm:col-span-2">{lead.notes}</p>}
                  </dl>
                )}
                {isMgr && lead.doNotContact && (
                  <button className="btn-ghost mt-2 text-xs" onClick={() => run(() => api(`/api/leads/${lead._id}`, { method: "PATCH", body: { doNotContact: false } }))}>
                    Lift do-not-contact
                  </button>
                )}
              </section>

              {/* Timeline */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Activity timeline</h3>
                <div className="mb-3 flex gap-2">
                  <input className="input" placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && note.trim() && run(async () => { await api(`/api/leads/${lead._id}/notes`, { body: { type: "note", summary: "Note", notes: note } }); setNote(""); })} />
                  <button
                    className="btn-secondary"
                    disabled={!note.trim() || saving}
                    onClick={() => run(async () => { await api(`/api/leads/${lead._id}/notes`, { body: { type: "note", summary: "Note", notes: note } }); setNote(""); })}
                  >
                    <StickyNote size={14} /> Add
                  </button>
                </div>
                <ol>
                  {detail!.activities.map((a) => (
                    <TimelineItem key={a._id} a={a} />
                  ))}
                </ol>
                {detail!.meetings.filter((m) => m.status === "Completed").length > 0 && (
                  <p className="mt-3 text-xs text-ink-muted">
                    Past meetings:{" "}
                    {detail!.meetings
                      .filter((m) => m.status === "Completed")
                      .map((m) => `${formatDateTimeShort(m.scheduledAt)} — ${m.outcome ? MEETING_OUTCOME_RULES[m.outcome].label : "done"}`)
                      .join("; ")}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
        {lead && (
          <div className="flex items-center gap-2 border-t border-surface-border px-5 py-2.5 text-[11px] text-ink-muted">
            {lead.assignee && <Avatar name={lead.assignee.name} role={lead.assignee.role} size="xs" />}
            Created {formatDateTimeShort(lead.createdAt)} · Last activity {timeAgo(lead.lastActivityAt)}
          </div>
        )}
      </aside>
    </div>
  );
}
