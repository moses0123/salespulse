/** Client-side fetch helper: returns `data` from the { success, data } envelope or throws an ApiError. */
export class ApiError extends Error {
  status: number;
  details?: any;
  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Request failed (${res.status})`, res.status);
  }
  if (!json.success) {
    const fieldErrors = json.details?.fieldErrors ? Object.values(json.details.fieldErrors).flat().join("; ") : "";
    throw new ApiError(fieldErrors ? `${json.error}: ${fieldErrors}` : json.error ?? "Request failed", res.status, json.details);
  }
  return json.data as T;
}

/** Trigger a browser download of a GET endpoint that returns a file. */
export async function download(url: string, fallbackName: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let msg = "Download failed";
    try {
      msg = (await res.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Browser-local "today" as from/to ISO strings. */
export function localDayRange(offsetDays = 0, spanDays = 1) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + spanDays);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function localDateInput(d = new Date()) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}
