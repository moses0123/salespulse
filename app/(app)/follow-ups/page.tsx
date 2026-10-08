"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import Tabs from "@/components/ui/Tabs";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNote from "@/components/ui/ErrorNote";
import { FollowUpCard } from "@/components/queue/QueueCards";
import { api } from "@/lib/client";
import { formatDateTimeShort } from "@/lib/utils";
import type { FollowUpDTO } from "@/lib/types";
import { leadTitle } from "@/lib/sales";

type View = "overdue" | "today" | "upcoming" | "completed";

/** §9 — every follow-up is a trackable task; managers get the real-time overdue view. */
export default function FollowUpsPage() {
  const { refreshKey, openLead } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const [view, setView] = useState<View>("overdue");
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<{ items: FollowUpDTO[]; counts: { overdue: number; today: number; upcoming: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api(`/api/follow-ups?view=${view}${userId ? `&userId=${userId}` : ""}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [view, userId, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Follow-ups</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Nothing relies on memory — every promised call-back lives here until it's done.</p>
        </div>
        {isMgr && (
          <select className="input !w-auto" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Person">
            <option value="">Everyone</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        )}
      </div>
      <Tabs<View>
        value={view}
        onChange={setView}
        tabs={[
          { value: "overdue", label: "Overdue", count: data?.counts.overdue, tone: "critical" },
          { value: "today", label: "Due today", count: data?.counts.today },
          { value: "upcoming", label: "Upcoming", count: data?.counts.upcoming },
          { value: "completed", label: "Completed" },
        ]}
      />
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-hover/5" />
      ) : data.items.length === 0 ? (
        <div className="panel">
          <EmptyState icon={CalendarClock} title={view === "overdue" ? "Nothing overdue" : "Nothing here"} description={view === "overdue" ? "Every follow-up is on time." : undefined} />
        </div>
      ) : view === "completed" ? (
        <div className="panel divide-y divide-surface-border/60">
          {data.items.map((f) => (
            <button key={f._id} onClick={() => openLead(f.leadId)} className="flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface-hover/[0.03]">
              <span className="font-medium text-ink">{f.lead ? leadTitle(f.lead) : ""}</span>
              <span className="text-ink-secondary">— {f.title}</span>
              <span className="ml-auto text-xs text-ink-muted">
                {f.status} {f.completedAt ? formatDateTimeShort(f.completedAt) : ""} · {f.assignee?.name}
                {f.completionNote ? ` · ${f.completionNote}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((f) => <FollowUpCard key={f._id} f={f} showAssignee={isMgr} />)}
        </div>
      )}
    </div>
  );
}
