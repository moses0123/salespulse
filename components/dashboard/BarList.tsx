/**
 * Horizontal single-series bars (magnitude → one hue). Value labels sit
 * beside each bar in text ink, and each row carries a native tooltip, so
 * nothing depends on colour alone.
 */
export default function BarList({
  rows,
  format = (n) => n.toLocaleString(),
  note,
}: {
  rows: { label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
  note?: (row: { label: string; value: number }, i: number) => string | null;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => {
        const extra = note?.(r, i);
        return (
          <li key={r.label} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}${extra ? ` (${extra})` : ""}`}>
            <span className="truncate text-xs text-ink-secondary">{r.label}</span>
            <span className="h-3.5 rounded-r-[4px] bg-surface-hover/[0.06]">
              <span className="block h-full rounded-r-[4px] bg-primary-600 transition-[width] duration-300" style={{ width: `${Math.max(r.value ? 1.5 : 0, (r.value / max) * 100)}%` }} />
            </span>
            <span className="min-w-[72px] text-right text-xs tabular-nums text-ink">
              {format(r.value)}
              {extra && <span className="ml-1 text-ink-muted">{extra}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
