/**
 * Timezone-aware day boundaries. Servers (Vercel etc.) usually run in UTC,
 * but "today" for the sales team means today in APP_TIMEZONE — so a call
 * logged at 00:30 local time on Tuesday counts towards Tuesday, not Monday.
 */
export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Lusaka";

function tzOffsetMinutes(date: Date, timeZone = APP_TIMEZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** "YYYY-MM-DD" for a moment, in the app timezone. */
export function dayKey(date: Date = new Date(), timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** [start, end) of the app-timezone day containing `date` (or the given "YYYY-MM-DD"). */
export function dayRange(day?: string | Date, timeZone = APP_TIMEZONE): { start: Date; end: Date; key: string } {
  const key = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : dayKey(day instanceof Date ? day : new Date(), timeZone);
  const [y, m, d] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const start = new Date(guess.getTime() - tzOffsetMinutes(guess, timeZone) * 60000);
  const nextGuess = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  const end = new Date(nextGuess.getTime() - tzOffsetMinutes(nextGuess, timeZone) * 60000);
  return { start, end, key };
}

/** Parse ?from=&to= query params (ISO datetimes or YYYY-MM-DD days), defaulting to today. */
export function parseRange(from?: string | null, to?: string | null): { start: Date; end: Date } {
  const today = dayRange();
  const start = from ? (/^\d{4}-\d{2}-\d{2}$/.test(from) ? dayRange(from).start : new Date(from)) : today.start;
  const end = to ? (/^\d{4}-\d{2}-\d{2}$/.test(to) ? dayRange(to).end : new Date(to)) : today.end;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return today;
  return { start, end };
}
