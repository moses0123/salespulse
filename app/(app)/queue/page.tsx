"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, CalendarClock, CalendarPlus, Flame, PhoneOutgoing, CheckCircle2, Upload } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import Kpi from "@/components/ui/Kpi";
import EmptyState from "@/components/ui/EmptyState";
import ErrorNote from "@/components/ui/ErrorNote";
import { FollowUpCard, LeadCard, MeetingCard } from "@/components/queue/QueueCards";
import { api } from "@/lib/client";
import type { QueueDTO } from "@/lib/types";

function Section({ title, icon: Icon, count, tone, children }: { title: string; icon: typeof Flame; count: number; tone?: "critical"; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <section>
      <h2 className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${tone === "critical" ? "text-critical-600 dark:text-critical-500" : "text-ink-secondary"}`}>
        <Icon size={15} /> {title} <span className="font-normal text-ink-muted">({count})</span>
      </h2>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">{children}</div>
    </section>
  );
}

function QueueInner() {
  const { refreshKey, openImport } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const params = useSearchParams();
  const [viewUser, setViewUser] = useState(params.get("userId") ?? "");
  const { users } = useUsers(undefined, { activeOnly: true });
  const [data, setData] = useState<QueueDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<QueueDTO>(`/api/queue${viewUser ? `?userId=${viewUser}` : ""}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [refreshKey, viewUser]);

  const t = data?.today;
  const isMe = !viewUser || viewUser === currentUser?._id;
  const nothing = data && !data.overdue.length && !data.dueToday.length && !data.meetingsToday.length && !data.newLeads.length && !data.hotLeads.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{isMe ? "My Day" : `${data?.user.name ?? "…"}'s day`}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Work top to bottom: overdue, due today, meetings, then fresh leads.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary" onClick={openImport}>
          <Upload size={15} /> Bulk upload
        </button>
        {isMgr && (
          <select className="input !w-auto" value={viewUser} onChange={(e) => setViewUser(e.target.value)} aria-label="View queue for">
            <option value="">My queue</option>
            {users.filter((u) => u._id !== currentUser?._id && u.role !== "admin").map((u) => (
              <option key={u._id} value={u._id}>{u.name}</option>
            ))}
          </select>
        )}
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Calls today" value={t?.callsAttempted ?? 0} target={data?.user.dailyCallTarget} />
        <Kpi label="Connected" value={t?.connected ?? 0} />
        <Kpi label="Interested" value={t?.interested ?? 0} />
        <Kpi label="Meetings booked" value={t?.meetingsBooked ?? 0} />
        <Kpi label="Follow-ups done" value={t?.followUpsCompleted ?? 0} sub={`${t?.followUpsCreated ?? 0} scheduled`} />
        <Kpi label="Overdue" value={data?.overdue.length ?? 0} tone="critical" />
      </div>

      {!data && !error && <div className="h-48 animate-pulse rounded-xl bg-surface-hover/5" />}

      {data && (
        <div className="space-y-6">
          <Section title="Overdue follow-ups" icon={AlertTriangle} count={data.overdue.length} tone="critical">
            {data.overdue.map((f) => <FollowUpCard key={f._id} f={f} />)}
          </Section>
          <Section title="Meetings today" icon={CalendarPlus} count={data.meetingsToday.length}>
            {data.meetingsToday.map((m) => <MeetingCard key={m._id} m={m} />)}
          </Section>
          <Section title="Follow-ups due today" icon={CalendarClock} count={data.dueToday.length}>
            {data.dueToday.map((f) => <FollowUpCard key={f._id} f={f} />)}
          </Section>
          <Section title="Hot leads without a next action today" icon={Flame} count={data.hotLeads.length}>
            {data.hotLeads.map((l) => <LeadCard key={l._id} lead={l} />)}
          </Section>
          <Section title={`New leads to call${data.newLeadsTotal > data.newLeads.length ? ` — showing ${data.newLeads.length} of ${data.newLeadsTotal}` : ""}`} icon={PhoneOutgoing} count={data.newLeads.length}>
            {data.newLeads.map((l) => <LeadCard key={l._id} lead={l} />)}
          </Section>
          {nothing && (
            <div className="panel">
              <EmptyState icon={CheckCircle2} title="Queue clear" description="No follow-ups, meetings or new leads waiting. Bulk-upload today's leads or add one you've sourced." />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function QueuePage() {
  return (
    <Suspense>
      <QueueInner />
    </Suspense>
  );
}
