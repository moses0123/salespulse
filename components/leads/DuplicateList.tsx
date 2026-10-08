"use client";

import { AlertTriangle } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { StageBadge } from "@/components/ui/StatusBadge";
import { formatDue, timeAgo } from "@/lib/utils";
import { leadTitle, leadSubtitle } from "@/lib/sales";
import type { DuplicateMatchDTO } from "@/lib/types";

/** §21 — show the current owner, last contact and next scheduled action for any match. */
export default function DuplicateList({ matches }: { matches: DuplicateMatchDTO[] }) {
  const { openLead } = useUI();
  const { currentUser } = useCurrentUser();
  if (!matches.length) return null;
  const isMgr = currentUser?.role !== "telemarketer";
  return (
    <div className="rounded-lg border border-attention-500/40 bg-attention-500/5 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-attention-700 dark:text-attention-500">
        <AlertTriangle size={14} /> Possible duplicate{matches.length > 1 ? "s" : ""} already in SalesPulse
      </p>
      <ul className="space-y-2">
        {matches.map((m) => {
          const canOpen = isMgr || m.assignee?._id === currentUser?._id;
          return (
            <li key={m._id} className="text-xs text-ink-secondary">
              <div className="flex flex-wrap items-center gap-1.5">
                {canOpen ? (
                  <button className="font-medium text-ink hover:underline" onClick={() => openLead(m._id)}>{leadTitle(m)}</button>
                ) : (
                  <span className="font-medium text-ink">{leadTitle(m)}</span>
                )}
                <span>· {leadSubtitle(m)}</span>
                <StageBadge stage={m.stage} />
                <span className="text-ink-muted">matched on {m.matchedOn.join(" + ")}</span>
              </div>
              <p className="mt-0.5 text-ink-muted">
                Owner: <span className="text-ink-secondary">{m.assignee?.name ?? "Unassigned"}</span> · Last contact: {m.lastContactAt ? timeAgo(m.lastContactAt) : "never"} · Next:{" "}
                {m.nextActionAt ? `${m.nextActionTitle} (${formatDue(m.nextActionAt)})` : "nothing scheduled"}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
