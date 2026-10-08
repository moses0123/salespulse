"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useUsers } from "@/hooks/useUsers";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import { api } from "@/lib/client";

/** Bulk (re)assign selected leads — to one person, round-robin, or by workload. */
export default function AssignLeadsModal() {
  const { assignLeadIds, closeAssign, triggerRefresh } = useUI();
  const { users } = useUsers(undefined, { activeOnly: true });
  const [mode, setMode] = useState<"user" | "round_robin" | "least_loaded" | "unassign">("user");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!assignLeadIds) return;
    setMode("user");
    setSelected([]);
    setError(null);
    setResult(null);
  }, [assignLeadIds]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ result: { name: string; count: number }[] }>("/api/leads/assign", {
        body: { leadIds: assignLeadIds, mode, userIds: selected },
      });
      setResult(res.result.map((r) => `${r.name}: ${r.count}`).join(" · "));
      triggerRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const n = assignLeadIds?.length ?? 0;
  const candidates = users.filter((u) => u.role !== "admin");
  return (
    <Modal
      open={!!assignLeadIds}
      onClose={closeAssign}
      size="sm"
      title={`Assign ${n} lead${n === 1 ? "" : "s"}`}
      footer={
        result ? (
          <button className="btn-primary" onClick={closeAssign}>Done</button>
        ) : (
          <>
            <button className="btn-secondary" onClick={closeAssign}>Cancel</button>
            <button className="btn-primary" disabled={busy || (mode !== "unassign" && !selected.length)} onClick={submit}>
              {busy && <Loader2 size={14} className="animate-spin" />} Assign
            </button>
          </>
        )
      }
    >
      {result ? (
        <p className="text-sm text-ink-secondary">Assigned — {result}. Open follow-ups and meetings moved with the leads.</p>
      ) : (
        <div className="space-y-3">
          <ErrorNote>{error}</ErrorNote>
          <div>
            <label className="label">How</label>
            <select className="input" value={mode} onChange={(e) => { setMode(e.target.value as any); setSelected([]); }}>
              <option value="user">All to one person</option>
              <option value="round_robin">Round-robin</option>
              <option value="least_loaded">Balance by workload</option>
              <option value="unassign">Unassign</option>
            </select>
          </div>
          {mode === "user" && (
            <select className="input" value={selected[0] ?? ""} onChange={(e) => setSelected(e.target.value ? [e.target.value] : [])}>
              <option value="">Choose…</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          )}
          {(mode === "round_robin" || mode === "least_loaded") && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-surface-border p-2">
              {candidates.map((u) => (
                <label key={u._id} className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input type="checkbox" checked={selected.includes(u._id)} onChange={(e) => setSelected(e.target.checked ? [...selected, u._id] : selected.filter((x) => x !== u._id))} />
                  {u.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
