"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import { useProducts } from "@/hooks/useCatalog";
import { TemperatureBadge } from "@/components/ui/StatusBadge";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import { api } from "@/lib/client";
import { cn, formatDue, formatMoney } from "@/lib/utils";
import { leadTitle, leadSubtitle, type LeadStage } from "@/lib/sales";
import type { LeadDTO } from "@/lib/types";

interface Column { stage: LeadStage; count: number; value: number; items: LeadDTO[] }

/** §12 — the pipeline board. Drag a card to move its stage (Lost asks for a reason). */
export default function PipelinePage() {
  const { refreshKey, triggerRefresh, openLead } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const products = useProducts();
  const [assignedTo, setAssignedTo] = useState("");
  const [productId, setProductId] = useState("");
  const [columns, setColumns] = useState<Column[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<LeadStage | null>(null);
  const [pendingLost, setPendingLost] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (assignedTo) qs.set("assignedTo", assignedTo);
    if (productId) qs.set("productId", productId);
    api<Column[]>(`/api/pipeline?${qs}`).then(setColumns).catch((e) => setError(e.message));
  }, [assignedTo, productId, refreshKey]);

  const move = async (leadId: string, stage: LeadStage, lostReason?: string) => {
    setError(null);
    try {
      await api(`/api/leads/${leadId}/stage`, { method: "PATCH", body: { stage, lostReason } });
      triggerRefresh();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const onDrop = (stage: LeadStage) => {
    setOver(null);
    if (!dragId) return;
    const from = columns?.find((c) => c.items.some((l) => l._id === dragId));
    if (from?.stage === stage) return;
    if (stage === "Lost") {
      setPendingLost(dragId);
      setReason("");
    } else move(dragId, stage);
    setDragId(null);
  };

  const openValue = columns?.filter((c) => c.stage !== "Won" && c.stage !== "Lost").reduce((a, c) => a + c.value, 0) ?? 0;
  const now = new Date();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Pipeline</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Open pipeline value: <span className="font-medium text-ink tabular-nums">{formatMoney(openValue)}</span></p>
        </div>
        <div className="flex gap-2">
          {isMgr && (
            <select className="input !w-auto" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} aria-label="Owner">
              <option value="">Everyone</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          )}
          <select className="input !w-auto" value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Product">
            <option value="">All products</option>
            {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <ErrorNote>{error}</ErrorNote>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-3">
          {(columns ?? []).map((c) => (
            <div
              key={c.stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.stage);
              }}
              onDragLeave={() => setOver((o) => (o === c.stage ? null : o))}
              onDrop={() => onDrop(c.stage)}
              className={cn("flex w-64 shrink-0 flex-col rounded-xl border border-surface-border bg-surface-inset/50", over === c.stage && "border-primary-500 bg-primary-500/5")}
            >
              <div className="flex items-baseline justify-between px-3 py-2.5">
                <p className="text-sm font-semibold text-ink">{c.stage}</p>
                <p className="text-xs text-ink-muted tabular-nums">
                  {c.count}
                  {c.value > 0 && ` · ${formatMoney(c.value)}`}
                </p>
              </div>
              <div className="flex max-h-[68vh] flex-col gap-2 overflow-y-auto px-2 pb-2">
                {c.items.map((l) => {
                  const overdue = l.nextActionAt && new Date(l.nextActionAt) < now;
                  return (
                    <div
                      key={l._id}
                      draggable
                      onDragStart={() => setDragId(l._id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => openLead(l._id)}
                      className={cn("cursor-pointer rounded-lg border border-surface-border bg-surface-panel p-2.5 shadow-panel hover:border-primary-500/50", dragId === l._id && "opacity-50")}
                    >
                      <p className="truncate text-sm font-medium text-ink">{leadTitle(l)}</p>
                      <p className="truncate text-xs text-ink-muted">{leadSubtitle(l)}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <TemperatureBadge temperature={l.temperature} score={l.score} />
                        {l.dealValue != null && <span className="text-xs tabular-nums text-ink-secondary">{formatMoney(l.dealValue)}</span>}
                      </div>
                      {l.nextActionAt && (
                        <p className={cn("mt-1.5 flex items-center gap-1 truncate text-[11px]", overdue ? "text-critical-600 dark:text-critical-500" : "text-ink-muted")}>
                          {overdue && <AlertTriangle size={11} />}
                          {formatDue(l.nextActionAt)}
                        </p>
                      )}
                      {isMgr && l.assignee && <p className="mt-0.5 truncate text-[11px] text-ink-muted">{l.assignee.name}</p>}
                    </div>
                  );
                })}
                {c.count > c.items.length && <p className="px-1 text-center text-[11px] text-ink-muted">+{c.count - c.items.length} more in Leads</p>}
              </div>
            </div>
          ))}
          {!columns && [...Array(6)].map((_, i) => <div key={i} className="h-96 w-64 animate-pulse rounded-xl bg-surface-hover/5" />)}
        </div>
      </div>

      <Modal
        open={!!pendingLost}
        onClose={() => setPendingLost(null)}
        title="Mark lead lost"
        size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPendingLost(null)}>Cancel</button>
            <button
              className="btn-primary"
              disabled={!reason.trim()}
              onClick={() => {
                move(pendingLost!, "Lost", reason);
                setPendingLost(null);
              }}
            >
              Mark lost
            </button>
          </>
        }
      >
        <label className="label">Reason</label>
        <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Price, competitor, no budget, went silent…" />
      </Modal>
    </div>
  );
}
