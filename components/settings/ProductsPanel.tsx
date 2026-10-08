"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Trash2, Loader2, EyeOff, Eye } from "lucide-react";
import { api } from "@/lib/client";
import type { ProductDTO } from "@/lib/types";

/** Product catalogue — what telemarketers pitch. */
export default function ProductsPanel() {
  const [items, setItems] = useState<ProductDTO[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<ProductDTO[]>("/api/products?all=1").then(setItems).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Package size={16} className="text-primary-600 dark:text-primary-300" />
        <h2 className="text-sm font-semibold text-ink">Products</h2>
      </div>
      {error && <p className="text-xs text-critical-500">{error}</p>}
      <ul className="divide-y divide-surface-border/60 rounded-lg border border-surface-border">
        {items.length === 0 && <li className="px-3 py-3 text-sm text-ink-muted">No products yet — add what your team sells (e.g. Sales CRM, VisitFlow, Odoo ERP).</li>}
        {items.map((p) => (
          <li key={p._id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className={p.isActive ? "text-ink" : "text-ink-muted line-through"}>{p.name}</span>
            {p.description && <span className="truncate text-xs text-ink-muted">— {p.description}</span>}
            <span className="ml-auto flex gap-1">
              <button className="btn-ghost !p-1.5" title={p.isActive ? "Deactivate" : "Reactivate"} onClick={() => run(() => api(`/api/products/${p._id}`, { method: "PATCH", body: { isActive: !p.isActive } }))}>
                {p.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              <button className="btn-ghost !p-1.5 hover:text-critical-500" title="Delete" onClick={() => run(() => api(`/api/products/${p._id}`, { method: "DELETE" }))}>
                <Trash2 size={13} />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className="input !w-48" placeholder="Product name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input min-w-0 flex-1" placeholder="Short description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <button
          className="btn-secondary"
          disabled={!name.trim() || busy}
          onClick={() =>
            run(async () => {
              await api("/api/products", { body: { name, description } });
              setName("");
              setDescription("");
            })
          }
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
        </button>
      </div>
    </div>
  );
}
