import { cn } from "@/lib/utils";

export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: string; count?: number; tone?: "critical" }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-surface-border">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            value === t.value ? "border-primary-600 text-ink" : "border-transparent text-ink-muted hover:text-ink"
          )}
        >
          {t.label}
          {t.count != null && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                t.tone === "critical" && t.count > 0 ? "bg-critical-500/15 text-critical-600 dark:text-critical-500" : "bg-surface-hover/10 text-ink-muted"
              )}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
