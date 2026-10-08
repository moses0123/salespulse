"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Building2, Plus } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { StageBadge } from "@/components/ui/StatusBadge";
import type { LeadDTO } from "@/lib/types";
import { leadTitle, leadSubtitle } from "@/lib/sales";

/** ⌘K / Ctrl+K — find a lead by company, contact, phone or email. */
export default function CommandPalette() {
  const { isCommandPaletteOpen, setCommandPaletteOpen, openLead, openAddLead } = useUI();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadDTO[]>([]);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
      if (e.key === "Escape") setCommandPaletteOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (!isCommandPaletteOpen) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const qs = new URLSearchParams({ pageSize: "8", sort: query ? "name" : "recent" });
      if (query) qs.set("q", query);
      const j = await (await fetch(`/api/leads?${qs}`, { cache: "no-store" })).json();
      if (j.success) {
        setResults(j.data.items);
        setActive(0);
      }
    }, 200);
  }, [query, isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const pick = (lead: LeadDTO) => {
    openLead(lead._id);
    setCommandPaletteOpen(false);
    setQuery("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[12vh] animate-fade-in">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCommandPaletteOpen(false)} />
      <div className="relative w-full max-w-xl panel overflow-hidden">
        <div className="flex items-center gap-2.5 border-b border-surface-border px-4 py-3">
          <Search size={16} className="text-ink-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(results.length - 1, a + 1));
              if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
              if (e.key === "Enter" && results[active]) pick(results[active]);
            }}
            placeholder="Name, phone, company or email…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
          />
          <kbd className="rounded border border-surface-border bg-surface-inset px-1.5 py-0.5 text-[10px] text-ink-muted">Esc</kbd>
        </div>
        <div className="max-h-96 overflow-y-auto py-1.5">
          {!query && <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Recently active</p>}
          {results.map((l, i) => (
            <button
              key={l._id}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(l)}
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm ${i === active ? "bg-surface-hover/5" : ""}`}
            >
              <Building2 size={15} className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-ink">{leadTitle(l)}</span>
                <span className="text-ink-muted"> — {leadSubtitle(l)}</span>
              </span>
              <StageBadge stage={l.stage} />
            </button>
          ))}
          {query && results.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-ink-muted">
              No leads match "{query}".
              <button
                className="btn-ghost mx-auto mt-2"
                onClick={() => {
                  setCommandPaletteOpen(false);
                  openAddLead();
                }}
              >
                <Plus size={14} /> Add it as a new lead
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
