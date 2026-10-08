"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarClock, AlertTriangle, Users, Sun, BarChart3, CalendarPlus } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { timeAgo, cn } from "@/lib/utils";
import type { NotificationLogDTO } from "@/lib/types";
import EmptyState from "@/components/ui/EmptyState";

const kindIcon: Record<string, typeof Bell> = {
  follow_up_due: CalendarClock,
  follow_up_assigned: CalendarClock,
  escalation: AlertTriangle,
  manager_alerts: AlertTriangle,
  leads_assigned: Users,
  morning_digest: Sun,
  daily_summary: BarChart3,
  meeting_upcoming: CalendarPlus,
  meeting_assigned: CalendarPlus,
};

export default function NotificationDrawer() {
  const { isNotificationsOpen, setNotificationsOpen, openLead } = useUI();
  const [items, setItems] = useState<NotificationLogDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isNotificationsOpen) return;
    setLoading(true);
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => j.success && setItems(j.data.items))
      .finally(() => {
        setLoading(false);
        fetch("/api/notifications/read", { method: "POST" });
      });
  }, [isNotificationsOpen]);

  if (!isNotificationsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end animate-fade-in">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => setNotificationsOpen(false)} />
      <div className="relative flex h-full w-full max-w-sm flex-col panel rounded-none border-l animate-slide-in">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-ink-muted" />
            <h2 className="text-sm font-semibold text-ink">Notifications</h2>
          </div>
          <button onClick={() => setNotificationsOpen(false)} className="text-xs text-ink-muted hover:text-ink-secondary">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-2 p-4">
              {[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-hover/5" />)}
            </div>
          )}
          {!loading && items.length === 0 && (
            <EmptyState icon={Bell} title="No notifications yet" description="Follow-up reminders, new leads and escalations show up here." />
          )}
          {!loading &&
            items.map((n) => {
              const Icon = kindIcon[n.kind] ?? Bell;
              return (
                <button
                  key={n._id}
                  disabled={!n.leadId}
                  onClick={() => {
                    if (!n.leadId) return;
                    setNotificationsOpen(false);
                    openLead(n.leadId);
                  }}
                  className={cn("flex w-full gap-3 border-b border-surface-border/60 px-4 py-3 text-left", n.leadId && "hover:bg-surface-hover/[0.04]", !n.readAt && "bg-primary-500/[0.04]")}
                >
                  <div className={cn("mt-0.5 shrink-0 rounded-full bg-surface-hover/5 p-1.5", n.kind === "escalation" ? "text-critical-500" : "text-ink-muted")}>
                    <Icon size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-ink-secondary">{n.message}</p>
                    <p className="mt-1 text-[11px] text-ink-muted">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-label="Unread" />}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}
