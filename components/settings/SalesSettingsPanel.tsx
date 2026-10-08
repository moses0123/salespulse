"use client";

import { useEffect, useState } from "react";
import { Save, Loader2, Target } from "lucide-react";
import { api } from "@/lib/client";
import { DEFAULT_WHATSAPP_TEMPLATE, fillWhatsAppTemplate } from "@/lib/sales";
import type { SettingsDTO } from "@/lib/types";

export default function SalesSettingsPanel({ initial }: { initial: SettingsDTO["sales"] | null }) {
  const [f, setF] = useState<SettingsDTO["sales"]>({
    whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATE,
    staleLeadHours: 48,
    escalateAfterHours: 24,
    alertEmail: true,
    alertWhatsApp: false,
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (initial) setF(initial);
  }, [initial]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/settings", { method: "PATCH", body: { sales: f } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex items-center gap-2">
        <Target size={16} className="text-primary-600 dark:text-primary-300" />
        <h2 className="text-sm font-semibold text-ink">Sales operation</h2>
      </div>
      {error && <p className="text-xs text-critical-500">{error}</p>}
      <div>
        <label className="label">WhatsApp follow-up message</label>
        <textarea className="input min-h-[80px]" value={f.whatsappTemplate} onChange={(e) => setF({ ...f, whatsappTemplate: e.target.value })} />
        <p className="mt-1 text-[11px] text-ink-muted">
          Placeholders: {"{{contact}} {{company}} {{agent}} {{product}}"}. Preview: “
          {fillWhatsAppTemplate(f.whatsappTemplate, { contact: "John", company: "ABC Logistics", agent: "Moses", product: "Sales CRM" })}”
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Lead "gone quiet" after (hours)</label>
          <input type="number" min={1} className="input" value={f.staleLeadHours} onChange={(e) => setF({ ...f, staleLeadHours: Number(e.target.value) || 48 })} />
        </div>
        <div>
          <label className="label">Escalate overdue follow-ups after (hours)</label>
          <input type="number" min={1} className="input" value={f.escalateAfterHours} onChange={(e) => setF({ ...f, escalateAfterHours: Number(e.target.value) || 24 })} />
        </div>
      </div>
      <div className="space-y-1.5 text-sm text-ink-secondary">
        <p className="label !mb-1">Staff alerts (in-app is always on)</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.alertEmail} onChange={(e) => setF({ ...f, alertEmail: e.target.checked })} /> Also send by email
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={f.alertWhatsApp} onChange={(e) => setF({ ...f, alertWhatsApp: e.target.checked })} /> Also send by WhatsApp (needs the webhook below and a number on each user)
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn-primary !py-1.5 !text-xs" onClick={save} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save sales settings
        </button>
        {saved && <span className="text-xs text-healthy-500">Saved</span>}
      </div>
    </div>
  );
}
