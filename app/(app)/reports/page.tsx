"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Save } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import ErrorNote from "@/components/ui/ErrorNote";
import RangePicker, { rangeFor, type RangeKey } from "@/components/dashboard/RangePicker";
import { api, download, localDateInput } from "@/lib/client";
import { formatRate, rate } from "@/lib/sales";
import type { ActivityMetrics, UserLite } from "@/lib/types";

type Row = ActivityMetrics & { user: UserLite; leadsAssigned: number; comment: string };

const METRICS: { key: keyof ActivityMetrics | "leadsAssigned"; label: string }[] = [
  { key: "leadsAssigned", label: "Open leads" },
  { key: "callsAttempted", label: "Calls attempted" },
  { key: "connected", label: "Connected" },
  { key: "noAnswer", label: "No answer" },
  { key: "busy", label: "Busy" },
  { key: "wrongNumber", label: "Wrong numbers" },
  { key: "interested", label: "Interested" },
  { key: "notInterested", label: "Not interested" },
  { key: "followUpsCreated", label: "Follow-ups created" },
  { key: "followUpsCompleted", label: "Follow-ups completed" },
  { key: "meetingsBooked", label: "Meetings booked" },
  { key: "meetingsHeld", label: "Meetings held" },
  { key: "proposalsRequested", label: "Proposals requested" },
  { key: "proposalsSent", label: "Proposals sent" },
  { key: "converted", label: "Converted" },
];

/** §15 — automated daily / weekly / monthly reporting. The numbers are generated; people only add a comment. */
export default function ReportsPage() {
  const { refreshKey } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const [custom, setCustom] = useState({ from: localDateInput(new Date(Date.now() - 6 * 86400000)), to: localDateInput() });
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<{ rows: Row[]; totals: ActivityMetrics & { leadsAssigned: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  const [exporting, setExporting] = useState(false);
  const range = useMemo(() => rangeFor(rangeKey, custom), [rangeKey, custom]);
  const qs = `from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}${userId ? `&userId=${userId}` : ""}`;

  useEffect(() => {
    api(`/api/reports/daily?${qs}`).then(setData).catch((e) => setError(e.message));
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

  const rows = data?.rows ?? [];
  const showTotals = rows.length > 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reports</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Generated automatically from every logged call, follow-up and meeting — no end-of-day spreadsheet.</p>
        </div>
        <button
          className="btn-secondary"
          disabled={exporting}
          onClick={() => {
            setExporting(true);
            download(`/api/reports/export?${qs}`, "salespulse-report.xlsx").catch((e) => setError(e.message)).finally(() => setExporting(false));
          }}
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />} Export Excel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RangePicker value={rangeKey} onChange={setRangeKey} custom={custom} onCustom={setCustom} />
        {isMgr && (
          <select className="input !w-auto !py-1.5" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Person">
            <option value="">Whole team</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        )}
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wide text-ink-muted">
              <th className="sticky left-0 bg-surface-panel px-4 py-2.5 font-medium">Metric</th>
              {rows.map((r) => <th key={r.user._id} className="px-3 py-2.5 text-right font-medium">{r.user.name}</th>)}
              {showTotals && <th className="px-4 py-2.5 text-right font-medium text-ink">Team</th>}
            </tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key} className="border-b border-surface-border/50">
                <td className="sticky left-0 bg-surface-panel px-4 py-2 text-ink-secondary">{m.label}</td>
                {rows.map((r) => <td key={r.user._id} className="px-3 py-2 text-right tabular-nums text-ink">{r[m.key]}</td>)}
                {showTotals && <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">{data!.totals[m.key]}</td>}
              </tr>
            ))}
            {[
              ["Contact rate", (x: ActivityMetrics) => rate(x.connected, x.callsAttempted)],
              ["Interest rate", (x: ActivityMetrics) => rate(x.interested, x.connected)],
              ["Meeting conversion", (x: ActivityMetrics) => rate(x.meetingsBooked, x.connected)],
            ].map(([label, fn]: any) => (
              <tr key={label} className="border-b border-surface-border/50 bg-surface-inset/40">
                <td className="sticky left-0 bg-surface-inset px-4 py-2 text-ink-secondary">{label}</td>
                {rows.map((r) => <td key={r.user._id} className="px-3 py-2 text-right tabular-nums text-ink">{formatRate(fn(r))}</td>)}
                {showTotals && <td className="px-4 py-2 text-right font-medium tabular-nums text-ink">{formatRate(fn(data!.totals))}</td>}
              </tr>
            ))}
            {rows.some((r) => r.comment) && (
              <tr>
                <td className="sticky left-0 bg-surface-panel px-4 py-2 align-top text-ink-secondary">Comments</td>
                {rows.map((r) => <td key={r.user._id} className="max-w-[220px] whitespace-pre-line px-3 py-2 text-xs text-ink-muted">{r.comment}</td>)}
                {showTotals && <td />}
              </tr>
            )}
          </tbody>
        </table>
        {data && rows.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">No telemarketers to report on yet.</p>}
      </div>

      <section className="panel p-4">
        <h2 className="text-sm font-semibold text-ink">My end-of-day comment</h2>
        <p className="mb-2 text-xs text-ink-muted">Optional context for today — the numbers above are already in your report.</p>
        <textarea className="input min-h-[80px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Lots of Logistics companies asking for a demo after 15th; two numbers from the Google Maps list were disconnected." />
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
