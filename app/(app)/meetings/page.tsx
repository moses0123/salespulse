"use client";

import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import Tabs from "@/components/ui/Tabs";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNote from "@/components/ui/ErrorNote";
import { MeetingCard } from "@/components/queue/QueueCards";
import { api } from "@/lib/client";
import type { MeetingDTO } from "@/lib/types";

type View = "upcoming" | "needs_outcome" | "past";

export default function MeetingsPage() {
  const { refreshKey } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const [view, setView] = useState<View>("upcoming");
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<{ items: MeetingDTO[]; counts: { upcoming: number; needsOutcome: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api(`/api/meetings?view=${view}${userId ? `&userId=${userId}` : ""}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [view, userId, refreshKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Meetings</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Demos and discovery meetings — record the outcome after each one.</p>
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
          { value: "upcoming", label: "Upcoming", count: data?.counts.upcoming },
          { value: "needs_outcome", label: "Needs outcome", count: data?.counts.needsOutcome, tone: "critical" },
          { value: "past", label: "Past" },
        ]}
      />
      <ErrorNote>{error}</ErrorNote>
      {!data ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-hover/5" />
      ) : data.items.length === 0 ? (
        <div className="panel"><EmptyState icon={CalendarPlus} title="No meetings here" description="Book one from a lead, or pick 'Meeting booked' when logging a call." /></div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((m) => <MeetingCard key={m._id} m={m} showOwner={isMgr} />)}
        </div>
      )}
    </div>
  );
}
