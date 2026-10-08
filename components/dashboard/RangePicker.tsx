"use client";

import { localDayRange, localDateInput } from "@/lib/client";
import { cn } from "@/lib/utils";

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

export function rangeFor(key: RangeKey, custom?: { from: string; to: string }) {
  if (key === "today") return localDayRange(0, 1);
  if (key === "yesterday") return localDayRange(-1, 1);
  if (key === "7d") return localDayRange(-6, 7);
  if (key === "30d") return localDayRange(-29, 30);
  if (key === "month") {
    const s = new Date();
    s.setHours(0, 0, 0, 0);
    s.setDate(1);
    const e = new Date();
    e.setHours(24, 0, 0, 0);
    return { from: s.toISOString(), to: e.toISOString() };
  }
  const from = new Date(`${custom?.from}T00:00`);
  const to = new Date(`${custom?.to}T00:00`);
  to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

const OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "month", label: "This month" },
  { key: "custom", label: "Custom" },
];

export default function RangePicker({
  value,
  onChange,
  custom,
  onCustom,
}: {
  value: RangeKey;
  onChange: (k: RangeKey) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-surface-border">
        {OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={cn("px-2.5 py-1.5 text-xs font-medium", value === o.key ? "bg-primary-600 text-white" : "text-ink-muted hover:bg-surface-hover/5")}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === "custom" && (
        <span className="flex items-center gap-1 text-xs text-ink-muted">
          <input type="date" className="input !w-auto !py-1 !text-xs" value={custom.from} max={custom.to} onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          to
          <input type="date" className="input !w-auto !py-1 !text-xs" value={custom.to} max={localDateInput()} onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
        </span>
      )}
    </div>
  );
}
