"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/** Compact prev/next pager — shared by any list that caps itself to a page at a time. */
export default function Pagination({
  page,
  pageCount,
  onChange,
  totalItems,
  pageSize,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  totalItems: number;
  pageSize: number;
}) {
  if (pageCount <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between border-t border-surface-border px-4 py-2.5 text-xs text-ink-muted">
      <span className="tabular-nums">
        {start}–{end} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="btn-ghost !p-1.5"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-1 tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          className="btn-ghost !p-1.5"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
