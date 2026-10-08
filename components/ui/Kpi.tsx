import { cn } from "@/lib/utils";

/** A stat tile: label, big number, optional sub-line and progress toward a target. */
export default function Kpi({
  label,
  value,
  sub,
  target,
  tone = "default",
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  target?: number;
  tone?: "default" | "critical" | "attention" | "healthy";
  onClick?: () => void;
}) {
  const numeric = typeof value === "number" ? value : null;
  const pct = target && numeric != null ? Math.min(100, Math.round((numeric / target) * 100)) : null;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn("panel p-3.5 text-left", onClick && "hover:bg-surface-hover/[0.03] transition-colors")}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "critical" && numeric ? "text-critical-600 dark:text-critical-500" : "text-ink",
          tone === "attention" && numeric ? "text-attention-600" : "",
          tone === "healthy" && numeric ? "text-healthy-600" : ""
        )}
      >
        {value}
        {target != null && <span className="ml-1 text-sm font-normal text-ink-muted">/ {target}</span>}
      </p>
      {pct != null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-hover/10" title={`${pct}% of target`}>
          <div className="h-full rounded-full bg-primary-600" style={{ width: `${pct}%` }} />
        </div>
      )}
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </Tag>
  );
}
