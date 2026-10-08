import { cn, initials } from "@/lib/utils";

const roleColors: Record<string, string> = {
  admin: "bg-primary-500/20 text-primary-600 dark:text-primary-300 ring-primary-500/30",
  manager: "bg-sky-500/20 text-sky-600 dark:text-sky-300 ring-sky-500/30",
  telemarketer: "bg-surface-hover/15 text-ink-secondary ring-surface-border",
};

export default function Avatar({ name, role, size = "sm", className }: { name: string; role?: string; size?: "xs" | "sm" | "md"; className?: string }) {
  const sizeClasses = { xs: "h-5 w-5 text-[10px]", sm: "h-7 w-7 text-xs", md: "h-9 w-9 text-sm" }[size];
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1",
        sizeClasses,
        role ? roleColors[role] ?? roleColors.telemarketer : "bg-surface-hover/10 text-ink-secondary ring-surface-border",
        className
      )}
      title={name}
    >
      {initials(name) || "?"}
    </div>
  );
}
