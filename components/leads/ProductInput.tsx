"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductDTO } from "@/lib/types";

/**
 * Product field you can type into or pick from: matching catalogue products
 * appear as tap-friendly chips under the box (a native <select> or <datalist>
 * is awkward on phones and useless when the catalogue is empty). A name that
 * isn't in the catalogue yet is added to it when the lead is saved.
 */
export default function ProductInput({
  value,
  onChange,
  products,
  placeholder = "Type a product, or tap one below",
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  products: ProductDTO[];
  placeholder?: string;
  id?: string;
}) {
  const q = value.trim().toLowerCase();
  const exact = products.find((p) => p.name.toLowerCase() === q);
  const suggestions = useMemo(
    () => (q ? products.filter((p) => p.name.toLowerCase().includes(q) && p.name.toLowerCase() !== q) : products).slice(0, 8),
    [products, q]
  );

  return (
    <div>
      <div className="relative">
        <input
          id={id}
          className="input pr-8"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="done"
        />
        {value && (
          <button type="button" onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted hover:text-ink" aria-label="Clear product">
            <X size={14} />
          </button>
        )}
      </div>
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((p) => (
            <button
              key={p._id}
              type="button"
              onClick={() => onChange(p.name)}
              className={cn("rounded-full border border-surface-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-primary-500/60 hover:text-ink")}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {q && !exact && <p className="mt-1 text-[11px] text-ink-muted">“{value.trim()}” is new — it will be added to the product list.</p>}
    </div>
  );
}
