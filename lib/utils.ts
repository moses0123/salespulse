import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class lists safely (handles conflicting utility classes). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a Date (or ISO string) as a short time badge, e.g. "10:42 AM". */
export function formatTimeBadge(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Format a Date as "Sep 8, 2026". */
export function formatDateShort(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a Date as "Sep 8, 2026, 4:00 PM" — used for due dates, which carry a meaningful time. */
export function formatDateTimeShort(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Convert a Date to the local-time string a `<input type="datetime-local">`
 * expects ("YYYY-MM-DDTHH:mm"). The reverse (`new Date(value)`) already
 * treats that shape as local time, so no conversion is needed on the way
 * back in.
 */
export function toDateTimeLocalValue(date: Date) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

/** A sensible default due datetime for a new task: today, end of business (5:00 PM). */
export function defaultDueDateTimeLocal() {
  const d = new Date();
  d.setHours(17, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return toDateTimeLocalValue(d);
}

/**
 * Human-readable overdue duration, e.g. "Overdue by 2d 4h" or "Overdue by 45m".
 * `reference` is a Date the delay is measured against; pass a due date that is
 * in the past. Returns null if the due date is not in the past.
 */
export function formatOverdueDuration(dueDate: Date | string, now: Date = new Date()) {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const diffMs = now.getTime() - due.getTime();
  if (diffMs <= 0) return null;

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Overdue by ${days}d ${hours}h`;
  if (hours > 0) return `Overdue by ${hours}h ${minutes}m`;
  return `Overdue by ${minutes}m`;
}

/**
 * Human-readable time remaining until a future due date, e.g. "Due in 3h 20m"
 * or "Due in 2d". Returns null once the due date has passed (use
 * formatOverdueDuration for that case instead) — callers typically branch on
 * whichever one applies.
 */
export function formatTimeRemaining(dueDate: Date | string, now: Date = new Date()) {
  const due = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  const diffMs = due.getTime() - now.getTime();
  if (diffMs <= 0) return null;

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Due in ${days}d ${hours}h`;
  if (hours > 0) return `Due in ${hours}h ${minutes}m`;
  return `Due in ${minutes}m`;
}

/** Hours elapsed since a given date. */
export function hoursSince(date: Date | string, now: Date = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  return (now.getTime() - d.getTime()) / (1000 * 60 * 60);
}

/** Relative "time ago" string, e.g. "3h ago", "2d ago", "just now". */
export function timeAgo(date: Date | string, now: Date = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Generate initials from a full name for avatar badges. */
export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** "Today 14:00", "Tomorrow 09:30", "Wed 8 Oct, 14:00" — for due dates in queues. */
export function formatDue(date: Date | string, now: Date = new Date()) {
  const d = typeof date === "string" ? new Date(date) : date;
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

/** Plain number with thousands separators; currency-agnostic (deal values). */
export function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** datetime-local value `hours` from now, rounded to the next quarter hour, skipping to 09:00 if it lands out of hours. */
export function suggestDateTimeLocal(hours: number) {
  const d = new Date(Date.now() + hours * 3600_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  if (d.getHours() >= 18) {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else if (d.getHours() < 8) {
    d.setHours(9, 0, 0, 0);
  }
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  return toDateTimeLocalValue(d);
}
