import { Flame, Thermometer, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import { OUTCOME_RULES, type CallOutcome, type LeadStage, type Temperature } from "@/lib/sales";

const stageStyles: Partial<Record<LeadStage, string>> = {
  New: "bg-surface-hover/5 text-ink-secondary ring-surface-border",
  Contacted: "bg-surface-hover/5 text-ink-secondary ring-surface-border",
  Connected: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/25",
  Interested: "bg-primary-500/10 text-primary-700 dark:text-primary-300 ring-primary-500/25",
  Qualified: "bg-primary-500/10 text-primary-700 dark:text-primary-300 ring-primary-500/25",
  "Meeting Booked": "bg-primary-500/15 text-primary-700 dark:text-primary-200 ring-primary-500/30",
  "Demo Completed": "bg-primary-500/15 text-primary-700 dark:text-primary-200 ring-primary-500/30",
  "Proposal Sent": "bg-attention-500/10 text-attention-700 dark:text-attention-500 ring-attention-500/30",
  Negotiation: "bg-attention-500/10 text-attention-700 dark:text-attention-500 ring-attention-500/30",
  Won: "bg-healthy-500/15 text-healthy-700 dark:text-healthy-500 ring-healthy-500/30",
  Lost: "bg-surface-hover/10 text-ink-muted ring-surface-border",
};

export function StageBadge({ stage, className }: { stage: LeadStage; className?: string }) {
  return <span className={cn("badge ring-1 whitespace-nowrap", stageStyles[stage], className)}>{stage}</span>;
}

const tempMeta: Record<Temperature, { icon: typeof Flame; cls: string }> = {
  Hot: { icon: Flame, cls: "bg-critical-500/10 text-critical-600 dark:text-critical-500 ring-critical-500/25" },
  Warm: { icon: Thermometer, cls: "bg-attention-500/10 text-attention-700 dark:text-attention-500 ring-attention-500/25" },
  Cold: { icon: Snowflake, cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/25" },
};

export function TemperatureBadge({ temperature, score, className }: { temperature: Temperature; score?: number; className?: string }) {
  const { icon: Icon, cls } = tempMeta[temperature];
  return (
    <span className={cn("badge ring-1 whitespace-nowrap", cls, className)} title={score != null ? `Lead score ${score}/100` : undefined}>
      <Icon size={11} />
      {temperature}
      {score != null && <span className="tabular-nums opacity-70">{score}</span>}
    </span>
  );
}

const toneCls = {
  neutral: "text-ink-secondary",
  negative: "text-critical-600 dark:text-critical-500",
  positive: "text-primary-700 dark:text-primary-300",
  win: "text-healthy-700 dark:text-healthy-500",
};

export function OutcomeText({ outcome, className }: { outcome: CallOutcome; className?: string }) {
  const rule = OUTCOME_RULES[outcome];
  return <span className={cn("text-xs font-medium", toneCls[rule.tone], className)}>{rule.label}</span>;
}
