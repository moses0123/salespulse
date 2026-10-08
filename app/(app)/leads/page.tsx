"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Upload, FileDown, Users as UsersIcon, Search, Building2, AlertTriangle } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import { useProducts, useFacets } from "@/hooks/useCatalog";
import { StageBadge, TemperatureBadge, OutcomeText } from "@/components/ui/StatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import Pagination from "@/components/ui/Pagination";
import ErrorNote from "@/components/ui/ErrorNote";
import { api, download } from "@/lib/client";
import { cn, formatDue, timeAgo } from "@/lib/utils";
import { LEAD_STAGES, LEAD_SOURCES, TEMPERATURES, leadTitle, leadSubtitle } from "@/lib/sales";
import type { LeadDTO } from "@/lib/types";

const QUICK = [
  { value: "", label: "All" },
  { value: "unworked", label: "Never called" },
  { value: "overdue", label: "Overdue action" },
  { value: "no_next_action", label: "No next action" },
  { value: "stale", label: "Gone quiet" },
  { value: "hot", label: "Hot" },
];

function LeadsInner() {
  const { refreshKey, openLead, openImport, openAssign } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const params = useSearchParams();
  const { users } = useUsers(undefined, { activeOnly: true });
  const products = useProducts();
  const facets = useFacets();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [filter, setFilter] = useState(params.get("filter") ?? "");
  const [stage, setStage] = useState(params.get("stage") ?? "open");
  const [temperature, setTemperature] = useState("");
  const [assignedTo, setAssignedTo] = useState(params.get("assignedTo") ?? "");
  const [source, setSource] = useState("");
  const [productId, setProductId] = useState("");
  const [industry, setIndustry] = useState("");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: LeadDTO[]; total: number; pageSize: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: "50", sort });
    if (debouncedQ) p.set("q", debouncedQ);
    if (filter) p.set("filter", filter);
    if (stage) p.set("stage", stage);
    if (temperature) p.set("temperature", temperature);
    if (assignedTo) p.set("assignedTo", assignedTo);
    if (source) p.set("source", source);
    if (productId) p.set("productId", productId);
    if (industry) p.set("industry", industry);
    return p.toString();
  }, [page, sort, debouncedQ, filter, stage, temperature, assignedTo, source, productId, industry]);

  useEffect(() => setPage(1), [debouncedQ, filter, stage, temperature, assignedTo, source, productId, industry, sort]);

  const load = useCallback(() => {
    api<{ items: LeadDTO[]; total: number; pageSize: number }>(`/api/leads?${qs}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [qs]);
  useEffect(load, [load, refreshKey]);
  useEffect(() => setSelected(new Set()), [qs, refreshKey]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const allOnPage = data?.items.length ? data.items.every((l) => selected.has(l._id)) : false;
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Leads</h1>
          <p className="mt-0.5 text-sm text-ink-muted">{isMgr ? "Every prospect in the database." : "Your assigned prospects."}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => download(`/api/leads/export?${qs}`, "leads.xlsx").catch((e) => setError(e.message))}>
            <FileDown size={15} /> Export
          </button>
          <button className="btn-secondary" onClick={openImport}>
            <Upload size={15} /> Bulk upload
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", filter === f.value ? "border-primary-600 bg-primary-500/10 text-primary-700 dark:text-primary-300" : "border-surface-border text-ink-muted hover:text-ink")}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <div className="relative col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input className="input !pl-8" placeholder="Search name, phone, company…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage">
          <option value="open">Open stages</option>
          <option value="">All stages</option>
          {LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" value={temperature} onChange={(e) => setTemperature(e.target.value)} aria-label="Temperature">
          <option value="">Any temperature</option>
          {TEMPERATURES.map((t) => <option key={t}>{t}</option>)}
        </select>
        {isMgr && (
          <select className="input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} aria-label="Owner">
            <option value="">Anyone</option>
            <option value="none">Unassigned</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        )}
        <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product">
          <option value="">Any product</option>
          {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
        </select>
        <select className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Industry">
          <option value="">Any industry</option>
          {facets.industries.map((i) => <option key={i}>{i}</option>)}
        </select>
        <select className="input" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
          <option value="">Any source</option>
          {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <ErrorNote>{error}</ErrorNote>

      {isMgr && selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-primary-500/30 bg-primary-500/5 px-3 py-2 text-sm">
          <span className="text-ink-secondary">{selected.size} selected</span>
          <button className="btn-primary !py-1" onClick={() => openAssign([...selected])}>
            <UsersIcon size={14} /> Assign
          </button>
          <button className="btn-ghost !py-1" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-2 text-xs text-ink-muted">
          <span>{data ? `${data.total.toLocaleString()} lead${data.total === 1 ? "" : "s"}` : "Loading…"}</span>
          <select className="bg-transparent text-xs focus:outline-none" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
            <option value="recent">Recently active</option>
            <option value="next">Next action due</option>
            <option value="score">Highest score</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        {!data ? (
          <div className="space-y-2 p-4">{[...Array(6)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-surface-hover/5" />)}</div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={Building2} title="No leads match" description="Adjust the filters, add a lead, or bulk-upload today's list." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-[11px] uppercase tracking-wide text-ink-muted">
                  {isMgr && (
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allOnPage}
                        onChange={() => setSelected(allOnPage ? new Set() : new Set(data.items.map((l) => l._id)))}
                        aria-label="Select page"
                      />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Stage</th>
                  <th className="px-3 py-2 font-medium">Interest</th>
                  <th className="px-3 py-2 font-medium">Last contact</th>
                  <th className="px-3 py-2 font-medium">Next action</th>
                  {isMgr && <th className="px-3 py-2 font-medium">Owner</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => {
                  const overdue = l.nextActionAt && new Date(l.nextActionAt) < now;
                  return (
                    <tr key={l._id} className="cursor-pointer border-b border-surface-border/50 last:border-0 hover:bg-surface-hover/[0.03]" onClick={() => openLead(l._id)}>
                      {isMgr && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(l._id)} onChange={() => toggle(l._id)} aria-label={`Select ${leadTitle(l)}`} />
                        </td>
                      )}
                      <td className="max-w-[280px] px-3 py-2">
                        <p className="truncate font-medium text-ink">{leadTitle(l)}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {leadSubtitle(l)}
                          {l.industry ? ` · ${l.industry}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2"><StageBadge stage={l.stage} /></td>
                      <td className="px-3 py-2"><TemperatureBadge temperature={l.temperature} score={l.score} /></td>
                      <td className="px-3 py-2 text-xs text-ink-muted">
                        {l.lastContactAt ? (
                          <>
                            {timeAgo(l.lastContactAt)}
                            {l.lastOutcome && <> · <OutcomeText outcome={l.lastOutcome} /></>}
                          </>
                        ) : (
                          "Never"
                        )}
                      </td>
                      <td className={cn("px-3 py-2 text-xs", overdue ? "font-medium text-critical-600 dark:text-critical-500" : "text-ink-secondary")}>
                        {l.nextActionAt ? (
                          <span className="flex items-center gap-1">
                            {overdue && <AlertTriangle size={12} />}
                            {formatDue(l.nextActionAt)}
                            <span className="truncate text-ink-muted"> · {l.nextActionTitle}</span>
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                      {isMgr && <td className="px-3 py-2 text-xs text-ink-secondary">{l.assignee?.name ?? <span className="text-attention-600">Unassigned</span>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} totalItems={data.total} pageSize={data.pageSize} />}
      </div>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsInner />
    </Suspense>
  );
}
