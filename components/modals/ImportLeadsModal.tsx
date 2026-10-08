"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, FileSpreadsheet, FileText, CheckCircle2, ArrowLeft, History } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { useCurrentUser } from "@/context/CurrentUserContext";
import { useUsers } from "@/hooks/useUsers";
import { useProducts } from "@/hooks/useCatalog";
import Modal from "@/components/ui/Modal";
import ErrorNote from "@/components/ui/ErrorNote";
import { api } from "@/lib/client";
import { cn, timeAgo } from "@/lib/utils";
import { LEAD_SOURCES } from "@/lib/sales";
import { LEAD_COLUMNS, guessMapping, guessByContent, type LeadColumnKey } from "@/lib/leadColumns";

type Status = "ok" | "missing_fields" | "invalid_phone" | "duplicate_in_file" | "existing_phone" | "existing_company";
interface RowResult { row: number; status: Status; name: string; companyName?: string; phone: string; message?: string; existingOwner?: string | null }
interface Preview { summary: Partial<Record<Status, number>>; total: number; results: RowResult[] }
interface UploadLog { _id: string; fileName: string; total: number; imported: number; skipped: number; createdAt: string; uploadedBy?: { name: string } }

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  ok: { label: "New — will import", cls: "bg-healthy-500/15 text-healthy-700 dark:text-healthy-500" },
  existing_company: { label: "Company already exists", cls: "bg-attention-500/15 text-attention-700 dark:text-attention-500" },
  invalid_phone: { label: "Number looks invalid", cls: "bg-attention-500/15 text-attention-700 dark:text-attention-500" },
  existing_phone: { label: "Number already in SalesPulse — skipped", cls: "bg-critical-500/15 text-critical-600 dark:text-critical-500" },
  duplicate_in_file: { label: "Repeated in file — skipped", cls: "bg-critical-500/15 text-critical-600 dark:text-critical-500" },
  missing_fields: { label: "No name or phone — skipped", cls: "bg-critical-500/15 text-critical-600 dark:text-critical-500" },
};

type Grid = string[][];
const colLetter = (i: number) => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");

/** Convert a sheet cell to text without losing phone digits (Excel stores 977123456 as a number). */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

/** The header row is the first of the top 10 rows that names a lead/phone column; otherwise the first non-empty row. */
function detectHeaderRow(grid: Grid): number {
  for (let i = 0; i < Math.min(10, grid.length); i++) {
    const g = guessMapping(grid[i].filter(Boolean), { exactOnly: true });
    if (g.name || g.phone) return i;
  }
  return Math.max(0, grid.findIndex((r) => r.some(Boolean)));
}

/**
 * Bulk upload — any CSV / Excel layout. Only the lead name and phone number
 * are required; SalesPulse guesses which columns hold what (by header name,
 * or by content when headers are missing) and lets the uploader correct it.
 */
export default function ImportLeadsModal() {
  const { isImportOpen, closeImport, triggerRefresh } = useUI();
  const { currentUser } = useCurrentUser();
  const isMgr = currentUser?.role !== "telemarketer";
  const { users } = useUsers(undefined, { activeOnly: true });
  const products = useProducts();

  const [step, setStep] = useState<"file" | "map" | "preview" | "done">("file");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Record<string, Grid>>({});
  const [sheetName, setSheetName] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Partial<Record<LeadColumnKey, string>>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [includeCompany, setIncludeCompany] = useState(false);
  const [includeInvalid, setIncludeInvalid] = useState(false);
  const [defaultSource, setDefaultSource] = useState("Excel/CSV import");
  const [defaultProductId, setDefaultProductId] = useState("");
  const [assignMode, setAssignMode] = useState<"none" | "user" | "round_robin" | "least_loaded">("none");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skipped: number; assignment: { name: string; count: number }[] } | null>(null);
  const [history, setHistory] = useState<UploadLog[]>([]);

  useEffect(() => {
    if (!isImportOpen) return;
    setStep("file");
    setFileName("");
    setSheets({});
    setPreview(null);
    setDone(null);
    setError(null);
    setAssignMode("none");
    setAssignees([]);
    setIncludeCompany(false);
    setIncludeInvalid(false);
    api<UploadLog[]>("/api/leads/import").then(setHistory).catch(() => {});
  }, [isImportOpen]);

  // Headers + data rows for the chosen sheet.
  const grid = sheets[sheetName] ?? [];
  const { headers, rows } = useMemo(() => {
    if (!grid.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
    const width = Math.max(1, ...grid.slice(0, 200).map((r) => r.length));
    const start = hasHeader ? headerRow : Math.max(0, grid.findIndex((r) => r.some(Boolean)));
    const raw = hasHeader ? grid[start] : [];
    const seen = new Map<string, number>();
    const hdrs = Array.from({ length: width }, (_, i) => {
      let h = (raw[i] ?? "").trim() || `Column ${colLetter(i)}`;
      const n = seen.get(h) ?? 0;
      seen.set(h, n + 1);
      if (n) h = `${h} (${n + 1})`;
      return h;
    });
    const firstData = hasHeader ? start + 1 : start;
    const body = grid
      .slice(firstData)
      .map((r, i) => ({ r, n: firstData + i + 1 }))
      .filter(({ r }) => r.some((c) => c && c.trim()));
    return {
      headers: hdrs,
      rows: body.map(({ r, n }) => {
        const rec: Record<string, string> = Object.fromEntries(hdrs.map((h, i) => [h, (r[i] ?? "").trim()]));
        rec._row = String(n);
        return rec;
      }),
    };
  }, [grid, hasHeader, headerRow]);

  // Re-guess the mapping whenever the header layout changes.
  useEffect(() => {
    if (!headers.length) return;
    const byHeader = hasHeader ? guessMapping(headers) : {};
    const byContent = guessByContent(headers, rows);
    setMapping({ ...byContent, ...byHeader, name: byHeader.name ?? byContent.name, phone: byHeader.phone ?? byContent.phone });
  }, [headers]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const isText = /\.(csv|txt)$/i.test(file.name);
      // raw for CSV keeps "0977…" as text instead of turning it into the number 977…
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, raw: isText });
      const parsed: Record<string, Grid> = {};
      for (const name of wb.SheetNames) {
        // Blank rows are kept so row numbers in the preview match the sheet.
        const g = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "", blankrows: true });
        const cleanGrid = g.map((r) => (r as unknown[]).map(cellText));
        while (cleanGrid.length && !cleanGrid[cleanGrid.length - 1].some(Boolean)) cleanGrid.pop();
        if (cleanGrid.some((r) => r.some(Boolean))) parsed[name] = cleanGrid;
      }
      const names = Object.keys(parsed);
      if (!names.length) throw new Error("That file looks empty.");
      // Prefer a sheet that has a name/phone header (skips cover / instruction sheets).
      const best = names.find((n) => { const g = parsed[n]; const h = detectHeaderRow(g); const m = guessMapping(g[h] ?? [], { exactOnly: true }); return m.name && m.phone; }) ?? names[0];
      setSheets(parsed);
      setFileName(file.name);
      setSheetName(best);
      const h = detectHeaderRow(parsed[best]);
      const hdrGuess = guessMapping(parsed[best][h] ?? [], { exactOnly: true });
      setHasHeader(!!(hdrGuess.name || hdrGuess.phone));
      setHeaderRow(h);
      setStep("map");
    } catch (e: any) {
      setError(e.message || "Couldn't read that file — is it .xlsx, .xls or .csv?");
    } finally {
      setBusy(false);
    }
  };

  const changeSheet = (name: string) => {
    setSheetName(name);
    const h = detectHeaderRow(sheets[name]);
    setHeaderRow(h);
    const g = guessMapping(sheets[name][h] ?? [], { exactOnly: true });
    setHasHeader(!!(g.name || g.phone));
  };

  const mappedRows = useMemo(
    () =>
      rows.map((r) => {
        const out: Record<string, string> = { _row: r._row };
        for (const c of LEAD_COLUMNS) {
          const src = mapping[c.key];
          if (src) out[c.key] = r[src] ?? "";
        }
        return out;
      }),
    [rows, mapping]
  );

  const checkFile = async () => {
    if (mappedRows.length > 5000) return setError("Max 5,000 rows per upload — split the file.");
    setBusy(true);
    setError(null);
    try {
      setPreview(await api<Preview>("/api/leads/import", { body: { rows: mappedRows, mode: "preview", fileName } }));
      setStep("preview");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const willImport = (preview?.summary.ok ?? 0) + (includeCompany ? preview?.summary.existing_company ?? 0 : 0) + (includeInvalid ? preview?.summary.invalid_phone ?? 0 : 0);

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api("/api/leads/import", {
        body: {
          rows: mappedRows,
          mode: "commit",
          fileName,
          includeCompanyMatches: includeCompany,
          includeInvalidPhones: includeInvalid,
          defaultSource,
          defaultProductId: defaultProductId || null,
          assign: assignMode === "none" ? { mode: "none" } : { mode: assignMode, userIds: assignees },
        },
      });
      setDone(res);
      setStep("done");
      triggerRefresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const flagged = preview?.results.filter((r) => r.status !== "ok") ?? [];
  const sample: Record<string, string> = rows[0] ?? {};
  const canCheck = !!mapping.name && !!mapping.phone && rows.length > 0;

  const footer =
    step === "done" ? (
      <button className="btn-primary" onClick={closeImport}>Done</button>
    ) : step === "file" ? (
      <button className="btn-secondary" onClick={closeImport}>Cancel</button>
    ) : step === "map" ? (
      <>
        <button className="btn-ghost mr-auto" onClick={() => setStep("file")}><ArrowLeft size={14} /> Other file</button>
        <button className="btn-secondary" onClick={closeImport}>Cancel</button>
        <button className="btn-primary" disabled={!canCheck || busy} onClick={checkFile}>
          {busy && <Loader2 size={14} className="animate-spin" />} Check {rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}
        </button>
      </>
    ) : (
      <>
        <button className="btn-ghost mr-auto" onClick={() => setStep("map")}><ArrowLeft size={14} /> Columns</button>
        <button className="btn-secondary" onClick={closeImport}>Cancel</button>
        <button className="btn-primary" disabled={!willImport || busy || (assignMode !== "none" && !assignees.length)} onClick={commit}>
          {busy && <Loader2 size={14} className="animate-spin" />} Upload {willImport.toLocaleString()} lead{willImport === 1 ? "" : "s"}
        </button>
      </>
    );

  return (
    <Modal
      open={isImportOpen}
      onClose={closeImport}
      size="lg"
      title="Bulk upload leads"
      description={
        step === "file"
          ? "Excel or CSV, in any layout. Only the lead's name and phone number are required."
          : step === "map"
            ? `${fileName} — match your columns. Name and phone are required; the rest is optional.`
            : step === "preview"
              ? `${fileName} — review before uploading. Nothing has been saved yet.`
              : undefined
      }
      footer={footer}
    >
      <div className="space-y-4">
        <ErrorNote>{error}</ErrorNote>

        {step === "file" && (
          <>
            <label
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border bg-surface-inset/50 px-4 py-10 text-center hover:border-primary-500/60"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
              }}
            >
              {busy ? <Loader2 size={26} className="animate-spin text-ink-muted" /> : <Upload size={26} className="text-primary-600" />}
              <span className="text-sm font-medium text-ink">Drop today's lead file here, or click to choose</span>
              <span className="text-xs text-ink-muted">.xlsx · .xls · .csv — up to 5,000 rows</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>

            <div className="rounded-lg border border-surface-border p-3">
              <p className="text-sm font-medium text-ink">Template for whoever sends you leads</p>
              <p className="mt-0.5 text-xs text-ink-muted">Attach it when you ask suppliers or colleagues for leads, so files arrive ready to upload. Name and phone are the only required columns.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a className="btn-secondary !py-1.5 text-xs" href="/templates/salespulse-lead-template.xlsx" download>
                  <FileSpreadsheet size={14} className="text-healthy-600" /> Excel template
                </a>
                <a className="btn-secondary !py-1.5 text-xs" href="/templates/salespulse-lead-template.csv" download>
                  <FileText size={14} /> CSV template
                </a>
              </div>
            </div>

            {history.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted"><History size={12} /> Recent uploads</p>
                <ul className="divide-y divide-surface-border/60 rounded-lg border border-surface-border text-xs">
                  {history.slice(0, 6).map((h) => (
                    <li key={h._id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-ink-secondary">{h.fileName || "Upload"}</span>
                      <span className="tabular-nums text-ink">{h.imported} added</span>
                      {h.skipped > 0 && <span className="tabular-nums text-ink-muted">{h.skipped} skipped</span>}
                      {isMgr && h.uploadedBy && <span className="text-ink-muted">{h.uploadedBy.name}</span>}
                      <span className="text-ink-muted">{timeAgo(h.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {step === "map" && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm text-ink-secondary">
              {Object.keys(sheets).length > 1 && (
                <label className="flex items-center gap-2">
                  Sheet
                  <select className="input !w-auto !py-1" value={sheetName} onChange={(e) => changeSheet(e.target.value)}>
                    {Object.keys(sheets).map((s) => <option key={s}>{s}</option>)}
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                First row has column names
              </label>
              {hasHeader && headerRow > 0 && <span className="text-xs text-ink-muted">(headers found on row {headerRow + 1})</span>}
              <span className="ml-auto text-xs text-ink-muted">{rows.length.toLocaleString()} data rows</span>
            </div>

            <div className="overflow-hidden rounded-lg border border-surface-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-inset text-left text-[11px] uppercase tracking-wide text-ink-muted">
                    <th className="px-3 py-2 font-medium">SalesPulse field</th>
                    <th className="px-3 py-2 font-medium">Column in your file</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">First row</th>
                  </tr>
                </thead>
                <tbody>
                  {LEAD_COLUMNS.map((c) => {
                    const req = "required" in c && c.required;
                    const missing = req && !mapping[c.key];
                    return (
                      <tr key={c.key} className={cn("border-b border-surface-border/60 last:border-0", missing && "bg-critical-500/5")}>
                        <td className="px-3 py-1.5 text-ink">
                          {c.label}
                          {req ? <span className="ml-1 text-critical-500">*</span> : <span className="ml-1 text-xs text-ink-muted">optional</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            className={cn("input !py-1", missing && "!border-critical-500")}
                            value={mapping[c.key] ?? ""}
                            onChange={(e) => setMapping({ ...mapping, [c.key]: e.target.value || undefined })}
                            aria-label={`Column for ${c.label}`}
                          >
                            <option value="">{req ? "Choose a column…" : "— not in this file —"}</option>
                            {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </td>
                        <td className="hidden max-w-[200px] truncate px-3 py-1.5 text-xs text-ink-muted sm:table-cell">{mapping[c.key] ? sample[mapping[c.key]!] || "—" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!canCheck && <p className="text-xs text-critical-600 dark:text-critical-500">Pick the columns holding the lead's name and phone number to continue.</p>}
          </>
        )}

        {step === "preview" && preview && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STATUS_META) as Status[]).filter((s) => preview.summary[s]).map((s) => (
                <span key={s} className={cn("badge", STATUS_META[s].cls)}>
                  {preview.summary[s]} · {STATUS_META[s].label}
                </span>
              ))}
            </div>
            {flagged.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-surface-border">
                <table className="w-full text-xs">
                  <tbody>
                    {flagged.slice(0, 300).map((r) => (
                      <tr key={r.row} className="border-b border-surface-border/60 last:border-0">
                        <td className="px-2 py-1.5 tabular-nums text-ink-muted">Row {r.row}</td>
                        <td className="px-2 py-1.5 text-ink-secondary">{r.name || "—"}</td>
                        <td className="px-2 py-1.5 text-ink-muted">{r.phone || "—"}</td>
                        <td className="px-2 py-1.5 text-ink-muted">
                          {r.message}
                          {r.existingOwner ? ` · owner: ${r.existingOwner}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="space-y-2 text-sm text-ink-secondary">
              {!!preview.summary.existing_company && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeCompany} onChange={(e) => setIncludeCompany(e.target.checked)} />
                  Also upload the {preview.summary.existing_company} rows whose company already exists (different number)
                </label>
              )}
              {!!preview.summary.invalid_phone && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeInvalid} onChange={(e) => setIncludeInvalid(e.target.checked)} />
                  Also upload the {preview.summary.invalid_phone} rows with invalid-looking numbers
                </label>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Source (when not in file)</label>
                <select className="input" value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)}>
                  {LEAD_SOURCES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Product (when not in file)</label>
                <select className="input" value={defaultProductId} onChange={(e) => setDefaultProductId(e.target.value)}>
                  <option value="">—</option>
                  {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
              </div>
              {isMgr ? (
                <>
                  <div>
                    <label className="label">Assign</label>
                    <select className="input" value={assignMode} onChange={(e) => { setAssignMode(e.target.value as any); setAssignees([]); }}>
                      <option value="none">Leave unassigned</option>
                      <option value="user">All to one person</option>
                      <option value="round_robin">Round-robin across people</option>
                      <option value="least_loaded">Balance by current workload</option>
                    </select>
                  </div>
                  {assignMode !== "none" && (
                    <div>
                      <label className="label">{assignMode === "user" ? "Person" : "People"}</label>
                      {assignMode === "user" ? (
                        <select className="input" value={assignees[0] ?? ""} onChange={(e) => setAssignees(e.target.value ? [e.target.value] : [])}>
                          <option value="">Choose…</option>
                          {users.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                        </select>
                      ) : (
                        <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-surface-border p-2">
                          {users.filter((u) => u.role !== "admin").map((u) => (
                            <label key={u._id} className="flex items-center gap-2 text-sm text-ink-secondary">
                              <input type="checkbox" checked={assignees.includes(u._id)} onChange={(e) => setAssignees(e.target.checked ? [...assignees, u._id] : assignees.filter((x) => x !== u._id))} />
                              {u.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-ink-muted sm:col-span-2">These leads will be assigned to you and appear in My Day.</p>
              )}
            </div>
          </>
        )}

        {step === "done" && done && (
          <div className="space-y-2 py-4 text-center">
            <CheckCircle2 size={32} className="mx-auto text-healthy-500" />
            <p className="text-sm font-medium text-ink">
              {done.imported} lead{done.imported === 1 ? "" : "s"} uploaded{done.skipped ? `, ${done.skipped} skipped` : ""}.
            </p>
            {done.assignment.length > 0 && <p className="text-xs text-ink-muted">{done.assignment.map((a) => `${a.name}: ${a.count}`).join(" · ")}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
