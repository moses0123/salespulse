"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldOff, AlertTriangle, Clock } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import Kpi from "@/components/ui/Kpi";
import Tabs from "@/components/ui/Tabs";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNote from "@/components/ui/ErrorNote";
import Avatar from "@/components/ui/Avatar";
import BarList from "@/components/dashboard/BarList";
import RangePicker, { rangeFor, type RangeKey } from "@/components/dashboard/RangePicker";
import { api, localDateInput } from "@/lib/client";
import { formatRate, rate, leadTitle } from "@/lib/sales";
import { formatDue, formatMoney, timeAgo } from "@/lib/utils";
import type { DashboardDTO, BreakdownRow } from "@/lib/types";

function BreakdownTable({ rows, label }: { rows: BreakdownRow[]; label: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-muted">No leads yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wide text-ink-muted">
            <th className="py-2 pr-3 font-medium">{label}</th>
            <th className="px-3 py-2 text-right font-medium">Leads</th>
            <th className="px-3 py-2 text-right font-medium">Interested</th>
            <th className="px-3 py-2 text-right font-medium">Meetings</th>
            <th className="px-3 py-2 text-right font-medium">Won</th>
            <th className="px-3 py-2 text-right font-medium">Win rate</th>
            <th className="py-2 pl-3 text-right font-medium">Open value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-surface-border/50 last:border-0">
              <td className="py-2 pr-3 text-ink">{r.key}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.leads}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.interested}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.meetings}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">{r.won}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink">{formatRate(rate(r.won, r.leads))}</td>
              <td className="py-2 pl-3 text-right tabular-nums text-ink-secondary">{formatMoney(r.pipelineValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** §16 — real-time management dashboard. */
export default function DashboardPage() {
  const { refreshKey, openLead } = useUI();
  const { currentUser, loading: userLoading } = useCurrentUser();
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [custom, setCustom] = useState({ from: localDateInput(new Date(Date.now() - 6 * 86400000)), to: localDateInput() });
  const [data, setData] = useState<DashboardDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<"product" | "industry" | "source">("product");
  const range = useMemo(() => rangeFor(rangeKey, custom), [rangeKey, custom]);

  useEffect(() => {
    if (currentUser?.role === "telemarketer") return;
    api<DashboardDTO>(`/api/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [range, refreshKey, currentUser]);

  // Live: refresh every 2 minutes while open.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 120_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (tick && currentUser?.role !== "telemarketer") api<DashboardDTO>(`/api/dashboard?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`).then(setData).catch(() => {});
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!userLoading && currentUser?.role === "telemarketer") {
    return <div className="panel p-8"><EmptyState icon={ShieldOff} title="Managers only" description="Your numbers are on My Day and Reports." /></div>;
  }

  const t = data?.totals;
  const r = data?.rates;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Sales Dashboard</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Who's been contacted, what happened, and what's next — live.</p>
        </div>
        <RangePicker value={rangeKey} onChange={setRangeKey} custom={custom} onCustom={setCustom} />
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Calls made" value={t?.callsAttempted ?? 0} sub={`${t?.connected ?? 0} connected`} />
        <Kpi label="Interested" value={t?.interested ?? 0} sub={`Interest rate ${formatRate(r?.interestRate ?? null)}`} />
        <Kpi label="Meetings booked" value={t?.meetingsBooked ?? 0} sub={`${t?.demosCompleted ?? 0} demos completed`} />
        <Kpi label="Proposals" value={t?.proposalsRequested ?? 0} sub={`${t?.proposalsSent ?? 0} sent`} />
        <Kpi label="Conversions" value={t?.converted ?? 0} tone="healthy" />
        <Kpi label="Open pipeline" value={formatMoney(t?.pipelineValue ?? 0)} sub={`${t?.openLeads ?? 0} open leads`} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/follow-ups"><Kpi label="Overdue follow-ups" value={t?.overdueFollowUps ?? 0} tone="critical" sub="Right now" /></Link>
        <Link href="/leads?filter=stale"><Kpi label="Gone quiet" value={t?.staleLeads ?? 0} tone="attention" sub="No recent activity" /></Link>
        <Link href="/leads?assignedTo=none"><Kpi label="Unassigned" value={t?.unassignedLeads ?? 0} tone="attention" sub="Open leads with no owner" /></Link>
        <Kpi label="Total leads" value={t?.totalLeads ?? 0} sub={`${t?.newLeadsInRange ?? 0} added in range`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="mb-1 text-sm font-semibold text-ink">Sales funnel</h2>
          <p className="mb-3 text-xs text-ink-muted">Activity in the selected range; % is conversion from the step above.</p>
          {data && (
            <BarList
              rows={data.funnel}
              note={(row, i) => (i === 0 ? null : formatRate(rate(row.value, data.funnel[i - 1].value)))}
            />
          )}
          {r && (
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-surface-border pt-3 text-xs sm:grid-cols-3">
              {[
                ["Contact rate", formatRate(r.contactRate)],
                ["Interest rate", formatRate(r.interestRate)],
                ["Meeting conversion", formatRate(r.meetingConversion)],
                ["Proposal conversion", formatRate(r.proposalConversion)],
                ["Customer conversion", formatRate(r.customerConversion)],
                ["Lead → customer (all time)", formatRate(r.leadToCustomer)],
                ["Activities per win", r.activitiesPerConversion ?? "—"],
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2">
                  <dt className="text-ink-muted">{k}</dt>
                  <dd className="tabular-nums text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
        <section className="panel p-4">
          <h2 className="mb-1 text-sm font-semibold text-ink">Leads by stage</h2>
          <p className="mb-3 text-xs text-ink-muted">Current position of every lead (all time).</p>
          {data && <BarList rows={data.byStage.map((s) => ({ label: s.stage, value: s.count }))} note={(row) => { const v = data.byStage.find((s) => s.stage === row.label)?.value; return v ? formatMoney(v) : null; }} />}
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold text-ink">Team performance</h2>
          <Link href="/reports" className="text-xs text-primary-600 hover:underline">Full report →</Link>
        </div>
        {data && data.team.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-muted">No telemarketers yet — add them on the Users page.</p>
        ) : (
          <div className="overflow-x-auto p-4 pt-2">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  <th className="py-2 pr-3 font-medium">Telemarketer</th>
                  {["Calls", "Connected", "Interested", "Meetings", "Follow-ups", "Won", "Contact %", "Interest %", "Open leads", "Overdue"].map((h) => (
                    <th key={h} className="px-2 py-2 text-right font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.team.map((row) => (
                  <tr key={row.user._id} className="border-b border-surface-border/50 last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/queue?userId=${row.user._id}`} className="flex items-center gap-2 text-ink hover:underline">
                        <Avatar name={row.user.name} role={row.user.role} size="xs" /> {row.user.name}
                      </Link>
                    </td>
                    {[row.callsAttempted, row.connected, row.interested, row.meetingsBooked, row.followUpsCreated, row.converted].map((v, i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums text-ink-secondary">{v}</td>
                    ))}
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{formatRate(row.contactRate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink">{formatRate(row.interestRate)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-ink-secondary">{row.leadsAssigned}</td>
                    <td className={`px-2 py-2 text-right tabular-nums ${row.overdueFollowUps ? "font-medium text-critical-600 dark:text-critical-500" : "text-ink-muted"}`}>{row.overdueFollowUps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel p-4">
        <h2 className="mb-2 text-sm font-semibold text-ink">What converts best</h2>
        <Tabs
          value={breakdown}
          onChange={setBreakdown}
          tabs={[{ value: "product", label: "Product" }, { value: "industry", label: "Industry" }, { value: "source", label: "Lead source" }]}
        />
        <div className="pt-2">
          {data && <BreakdownTable label={breakdown === "product" ? "Product" : breakdown === "industry" ? "Industry" : "Source"} rows={breakdown === "product" ? data.byProduct : breakdown === "industry" ? data.byIndustry : data.bySource} />}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-critical-600 dark:text-critical-500"><AlertTriangle size={14} /> Most overdue follow-ups</h2>
          {data?.overdueSample.length ? (
            <ul className="divide-y divide-surface-border/60">
              {data.overdueSample.map((f) => (
                <li key={f._id}>
                  <button className="flex w-full items-center gap-2 py-2 text-left text-sm" onClick={() => openLead(f.leadId)}>
                    <span className="min-w-0 flex-1 truncate text-ink">{f.lead ? leadTitle(f.lead) : ""} <span className="text-ink-muted">— {f.title}</span></span>
                    <span className="shrink-0 text-xs text-critical-600 dark:text-critical-500">{formatDue(f.dueAt)}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{f.assignee?.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-ink-muted">Nothing overdue.</p>
          )}
        </section>
        <section className="panel p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink-secondary"><Clock size={14} /> Leads gone quiet</h2>
          {data?.staleSample.length ? (
            <ul className="divide-y divide-surface-border/60">
              {data.staleSample.map((l) => (
                <li key={l._id}>
                  <button className="flex w-full items-center gap-2 py-2 text-left text-sm" onClick={() => openLead(l._id)}>
                    <span className="min-w-0 flex-1 truncate text-ink">{leadTitle(l)} <span className="text-ink-muted">— {l.stage}</span></span>
                    <span className="shrink-0 text-xs text-ink-muted">{timeAgo(l.lastActivityAt)}</span>
                    <span className="shrink-0 text-xs text-ink-muted">{l.assignee?.name ?? "Unassigned"}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-ink-muted">Every open lead has recent activity.</p>
          )}
        </section>
      </div>
    </div>
  );
}
