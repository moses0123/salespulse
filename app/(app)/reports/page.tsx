"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, Loader2, Save } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import ErrorNote from "@/components/ui/ErrorNote";
import RangePicker, { rangeFor, type RangeKey } from "@/components/dashboard/RangePicker";
import { api, download, localDateInput } from "@/lib/client";
import { cn } from "@/lib/utils";

interface Summary {
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
interface Block { summary: Summary; products: Record<string, number>; sources: Record<string, number>; dueToday: number; overdue: number }
interface Report {
  from: string;
  to: string;
  productNames: string[];
  sources: string[];
  telecallers: (Block & { user: { _id: string; name: string }; rowCount: number })[];
  total: Block;
}

const SUMMARY_ROWS: { key: keyof Summary; label: string; fmt?: "pct" | "dec" }[] = [
  { key: "totalCalls", label: "Total Calls" },
  { key: "connected", label: "Connected Calls" },
  { key: "notConnected", label: "Not Connected" },
  { key: "newLeads", label: "New Leads Called" },
  { key: "followUps", label: "Follow-up Calls" },
  { key: "talkTime", label: "Total Talk Time (mins)", fmt: "dec" },
  { key: "avgConnected", label: "Avg Call Length - connected (mins)", fmt: "dec" },
  { key: "interested", label: "Interested" },
  { key: "notInterested", label: "Not Interested" },
  { key: "hot", label: "Hot Leads" },
  { key: "warm", label: "Warm Leads" },
  { key: "cold", label: "Cold Leads" },
  { key: "dealsClosed", label: "Deals Closed" },
  { key: "connectRate", label: "Connect Rate", fmt: "pct" },
  { key: "interestRate", label: "Interest Rate (of connected)", fmt: "pct" },
];

const fmt = (v: number, f?: "pct" | "dec") => (f === "pct" ? `${Math.round(v * 100)}%` : f === "dec" ? v.toFixed(1) : v.toLocaleString());

/**
 * §15 + the team's Telecaller Daily Call Report: the same Dashboard blocks
 * as the Excel file, live, with a one-click download of the workbook.
 */
export default function ReportsPage() {
  const { refreshKey } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [custom, setCustom] = useState({ from: localDateInput(new Date(Date.now() - 6 * 86400000)), to: localDateInput() });
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [downloading, setDownloading] = useState<"report" | "activity" | null>(null);

  // The report works in whole days (the sheet's Date column), so send YYYY-MM-DD.
  const days = useMemo(() => {
    const r = rangeFor(rangeKey, custom);
    const from = localDateInput(new Date(r.from));
    const to = localDateInput(new Date(new Date(r.to).getTime() - 1));
    return { from, to };
  }, [rangeKey, custom]);
  const qs = `from=${days.from}&to=${days.to}${userId ? `&userId=${userId}` : ""}`;

  useEffect(() => {
    setData(null);
    api<Report>(`/api/reports/call-report?${qs}&format=json`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [qs, refreshKey]);

  useEffect(() => {
    api<{ comment: string }>(`/api/reports/note?date=${localDateInput()}`).then((n) => setComment(n.comment)).catch(() => {});
  }, []);

  const saveNote = async () => {
    setSavingNote(true);
    try {
      await api("/api/reports/note", { method: "PUT", body: { date: localDateInput(), comment } });
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingNote(false);
    }
  };

  const dl = (kind: "report" | "activity") => {
    setDownloading(kind);
    const url = kind === "report" ? `/api/reports/call-report?${qs}` : `/api/reports/export?${qs}`;
    download(url, kind === "report" ? "Telecaller_Daily_Call_Report.xlsx" : "salespulse-activity.xlsx")
      .catch((e) => setError(e.message))
      .finally(() => setDownloading(null));
  };

  const people = data?.telecallers ?? [];

  const Table = ({ title, rows }: { title: string; rows: { label: string; values: (string | number)[]; total: string | number }[] }) => (
    <section className="panel overflow-x-auto">
      <h2 className="px-4 pt-3.5 text-sm font-semibold text-ink">{title}</h2>
      <table className="mt-2 w-full min-w-[560px] text-sm">
        <thead>
          <tr className="bg-[#1F3864] text-left text-[11px] uppercase tracking-wide text-white">
            <th className="sticky left-0 bg-[#1F3864] px-4 py-2 font-medium">Metric</th>
            {people.map((p) => (
              <th key={p.user._id} className="px-3 py-2 text-right font-medium">{p.user.name}</th>
            ))}
            <th className="px-4 py-2 text-right font-medium">Team Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-surface-border/50 last:border-0">
              <td className="sticky left-0 bg-surface-panel px-4 py-1.5 font-medium text-ink-secondary">{r.label}</td>
              {r.values.map((v, i) => (
                <td key={i} className="px-3 py-1.5 text-right tabular-nums text-ink">{v}</td>
              ))}
              <td className="bg-surface-hover/[0.04] px-4 py-1.5 text-right font-semibold tabular-nums text-ink">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Telecaller Daily Call Report</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Filled in automatically from every logged call — the same layout as the team's Excel report.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={!!downloading} onClick={() => dl("activity")} title="Every call, follow-up and meeting as a flat list">
            {downloading === "activity" ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} Activity log
          </button>
          <button className="btn-primary" disabled={!!downloading} onClick={() => dl("report")}>
            {downloading === "report" ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />} Download report (Excel)
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RangePicker value={rangeKey} onChange={setRangeKey} custom={custom} onCustom={setCustom} />
        {isMgr && (
          <select className="input !w-auto !py-1.5" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Telecaller">
            <option value="">All telecallers</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        )}
        <span className="text-xs text-ink-muted">
          {days.from === days.to ? days.from : `${days.from} → ${days.to}`}
          {data && ` · ${data.total.summary.totalCalls} call${data.total.summary.totalCalls === 1 ? "" : "s"}`}
        </span>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {!data ? (
        <div className="h-64 animate-pulse rounded-xl bg-surface-hover/5" />
      ) : people.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-ink-muted">No telecallers yet — add users with the Telemarketer role.</div>
      ) : (
        <>
          <Table
            title="Call Summary (for selected dates)"
            rows={SUMMARY_ROWS.map((r) => ({
              label: r.label,
              values: people.map((p) => fmt(p.summary[r.key], r.fmt)),
              total: fmt(data.total.summary[r.key], r.fmt),
            }))}
          />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Table
              title="Product Interest (for selected dates)"
              rows={data.productNames.map((name) => ({
                label: name,
                values: people.map((p) => p.products[name] ?? 0),
                total: data.total.products[name] ?? 0,
              }))}
            />
            <Table
              title="Calls by Lead Source (for selected dates)"
              rows={data.sources.map((s) => ({
                label: s,
                values: people.map((p) => p.sources[s] ?? 0),
                total: data.total.sources[s] ?? 0,
              }))}
            />
          </div>
          <Table
            title="Follow-ups Due (right now)"
            rows={[
              { label: "Due Today", values: people.map((p) => p.dueToday), total: data.total.dueToday },
              { label: "Overdue (date passed)", values: people.map((p) => p.overdue), total: data.total.overdue },
            ]}
          />
        </>
      )}

      <section className={cn("panel p-4")}>
        <h2 className="text-sm font-semibold text-ink">My end-of-day comment</h2>
        <p className="mb-2 text-xs text-ink-muted">Optional context for today — the numbers above are already in your report.</p>
        <textarea className="input min-h-[80px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Lots of Meta leads asking for VisitFlow pricing; two numbers from today's list were switched off all day." />
        <div className="mt-2 flex items-center gap-2">
          <button className="btn-primary" onClick={saveNote} disabled={savingNote}>
            {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save comment
          </button>
          {savedNote && <span className="text-xs text-healthy-600">Saved</span>}
        </div>
      </section>
    </div>
  );
}
