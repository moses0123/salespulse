"use client";

import { useEffect, useState } from "react";
import { Mail, MessageCircle, Save, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { useCurrentUser } from "@/context/CurrentUserContext";
import type { SettingsDTO, WebhookKVDTO } from "@/lib/types";
import EmptyState from "@/components/ui/EmptyState";
import SalesSettingsPanel from "@/components/settings/SalesSettingsPanel";
import ProductsPanel from "@/components/settings/ProductsPanel";

const HTTP_METHODS = ["POST", "GET", "PUT", "PATCH"] as const;

let kvSeq = 0;
function newKvRow(): WebhookKVDTO & { _key: number } {
  kvSeq += 1;
  return { key: "", value: "", _key: kvSeq };
}

type KvRow = WebhookKVDTO & { _key: number };

function toKvRows(rows: WebhookKVDTO[]): KvRow[] {
  return rows.length > 0 ? rows.map((r) => ({ ...r, _key: ++kvSeq })) : [newKvRow()];
}

/**
 * Super Admin only. Configures the real-world delivery integrations —
 * SMTP for email, a generic WhatsApp HTTP webhook — that lib/mailer.ts and
 * lib/whatsapp.ts use once filled in — plus the sales-operation settings
 * and the product catalogue. Until delivery is configured, alerts still
 * appear in the in-app Notifications drawer.
 */
export default function SettingsPage() {
  const { currentUser } = useCurrentUser();
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"smtp" | "whatsapp" | null>(null);
  const [savedAt, setSavedAt] = useState<"smtp" | "whatsapp" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // SMTP form state
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUsername, setSmtpUsername] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState("");

  // WhatsApp webhook form state
  const [waEndpointUrl, setWaEndpointUrl] = useState("");
  const [waMethod, setWaMethod] = useState<(typeof HTTP_METHODS)[number]>("POST");
  const [waHeaders, setWaHeaders] = useState<KvRow[]>([newKvRow()]);
  const [waBodyFields, setWaBodyFields] = useState<KvRow[]>([newKvRow()]);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          const s: SettingsDTO = json.data;
          setSettings(s);
          setSmtpHost(s.smtp.host ?? "");
          setSmtpPort(s.smtp.port ? String(s.smtp.port) : "");
          setSmtpSecure(s.smtp.secure);
          setSmtpUsername(s.smtp.username ?? "");
          setSmtpFromName(s.smtp.fromName ?? "");
          setSmtpFromEmail(s.smtp.fromEmail ?? "");
          setWaEndpointUrl(s.whatsapp.endpointUrl ?? "");
          setWaMethod((s.whatsapp.method as (typeof HTTP_METHODS)[number]) ?? "POST");
          setWaHeaders(toKvRows(s.whatsapp.headers));
          setWaBodyFields(toKvRows(s.whatsapp.bodyFields));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (currentUser && currentUser.role !== "admin") {
    return (
      <EmptyState
        icon={Mail}
        title="Super Admin only"
        description="Integration settings are only visible to a Super Admin."
      />
    );
  }

  const saveSmtp = async () => {
    setSaving("smtp");
    setError(null);
    setSavedAt(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp: {
            host: smtpHost,
            port: smtpPort ? Number(smtpPort) : null,
            secure: smtpSecure,
            username: smtpUsername,
            password: smtpPassword || undefined,
            fromName: smtpFromName,
            fromEmail: smtpFromEmail,
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Failed to save SMTP settings");
        return;
      }
      setSmtpPassword("");
      setSavedAt("smtp");
      setSettings((prev) =>
        prev ? { ...prev, smtp: { ...prev.smtp, passwordSet: prev.smtp.passwordSet || !!smtpPassword } } : prev
      );
    } catch {
      setError("Failed to save SMTP settings");
    } finally {
      setSaving(null);
    }
  };

  const saveWhatsapp = async () => {
    setSaving("whatsapp");
    setError(null);
    setSavedAt(null);
    try {
      const cleanRows = (rows: KvRow[]) =>
        rows.filter((r) => r.key.trim().length > 0).map((r) => ({ key: r.key.trim(), value: r.value }));
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp: {
            endpointUrl: waEndpointUrl,
            method: waMethod,
            headers: cleanRows(waHeaders),
            bodyFields: cleanRows(waBodyFields),
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Failed to save WhatsApp settings");
        return;
      }
      setSavedAt("whatsapp");
    } catch {
      setError("Failed to save WhatsApp settings");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-surface-hover/10" />
        <div className="panel h-64 animate-pulse" />
      </div>
    );
  }

  const KvEditor = ({ rows, setRows }: { rows: KvRow[]; setRows: (rows: KvRow[]) => void }) => (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row._key} className="flex items-center gap-2">
          <input
            className="input flex-1"
            placeholder="key"
            value={row.key}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...row, key: e.target.value };
              setRows(next);
            }}
          />
          <input
            className="input flex-[1.4]"
            placeholder="value — supports {{phone}}, {{message}}, {{name}}"
            value={row.value}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...row, value: e.target.value };
              setRows(next);
            }}
          />
          <button
            className="btn-ghost !p-1.5 shrink-0 hover:text-critical-500"
            onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [newKvRow()])}
            title="Remove"
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-300"
        onClick={() => setRows([...rows, newKvRow()])}
        type="button"
      >
        <Plus size={13} />
        Add
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Products, sales rules, and real email/WhatsApp delivery for reminders and alerts.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-critical-500/30 bg-critical-500/10 px-3 py-2 text-xs text-critical-500">
          {error}
        </div>
      )}

      <ProductsPanel />
      <SalesSettingsPanel initial={settings?.sales ?? null} />

      <div className="panel p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail size={16} className="text-primary-600 dark:text-primary-300" />
          <h2 className="text-sm font-semibold text-ink">Email (SMTP)</h2>
          {settings?.smtp.passwordSet && (
            <span className="flex items-center gap-1 text-[11px] text-healthy-500">
              <CheckCircle2 size={11} />
              Configured
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted">
          Any standard SMTP provider works — Gmail (with an app password), SES, Resend, Mailgun,
          your own mail server. Without this, alerts are in-app only.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">SMTP Host</label>
            <input className="input" placeholder="smtp.resend.com" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
          </div>
          <div>
            <label className="label">Port</label>
            <input
              className="input"
              placeholder="587"
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Username</label>
            <input className="input" value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} />
          </div>
          <div>
            <label className="label">Password {settings?.smtp.passwordSet && <span className="text-healthy-500">(set)</span>}</label>
            <input
              className="input"
              type="password"
              placeholder={settings?.smtp.passwordSet ? "Leave blank to keep current" : ""}
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">From Name</label>
            <input className="input" placeholder="SalesPulse" value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} />
          </div>
          <div>
            <label className="label">From Email</label>
            <input
              className="input"
              placeholder="noreply@yourcompany.com"
              value={smtpFromEmail}
              onChange={(e) => setSmtpFromEmail(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            checked={smtpSecure}
            onChange={(e) => setSmtpSecure(e.target.checked)}
            className="h-4 w-4 rounded border-surface-border bg-surface-inset accent-primary-600"
          />
          Use TLS (typically on for port 465, off for 587/25)
        </label>

        <div className="flex items-center gap-2">
          <button className="btn-primary !text-xs !py-1.5" onClick={saveSmtp} disabled={saving === "smtp"}>
            {saving === "smtp" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save Email Settings
          </button>
          {savedAt === "smtp" && <span className="text-xs text-healthy-500">Saved</span>}
        </div>
      </div>

      <div className="panel p-5 space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-primary-600 dark:text-primary-300" />
          <h2 className="text-sm font-semibold text-ink">WhatsApp (HTTP webhook)</h2>
          {settings?.whatsapp.endpointUrl && (
            <span className="flex items-center gap-1 text-[11px] text-healthy-500">
              <CheckCircle2 size={11} />
              Configured
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted">
          Calls any WhatsApp sending API over plain HTTP — the same setup used for WhatsApp
          automations on our other products, so you can point this at the same provider/account.
          Add whatever headers and body fields your provider expects; a value can include{" "}
          <code className="rounded bg-surface-inset px-1 py-0.5">{"{{phone}}"}</code>,{" "}
          <code className="rounded bg-surface-inset px-1 py-0.5">{"{{message}}"}</code>, and{" "}
          <code className="rounded bg-surface-inset px-1 py-0.5">{"{{name}}"}</code> placeholders,
          filled in per recipient when a reminder goes out. Without this, WhatsApp sends fall back
          to the simulated in-app notification only.
        </p>

        <div>
          <label className="label">HTTP Endpoint URL</label>
          <input
            className="input"
            placeholder="https://your-provider.example.com/api/send"
            value={waEndpointUrl}
            onChange={(e) => setWaEndpointUrl(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Method</label>
          <select
            className="input !w-32"
            value={waMethod}
            onChange={(e) => setWaMethod(e.target.value as (typeof HTTP_METHODS)[number])}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Headers</label>
          <KvEditor rows={waHeaders} setRows={setWaHeaders} />
        </div>

        <div>
          <label className="label">Body fields</label>
          <KvEditor rows={waBodyFields} setRows={setWaBodyFields} />
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-primary !text-xs !py-1.5" onClick={saveWhatsapp} disabled={saving === "whatsapp"}>
            {saving === "whatsapp" ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Save WhatsApp Settings
          </button>
          {savedAt === "whatsapp" && <span className="text-xs text-healthy-500">Saved</span>}
        </div>
      </div>
    </div>
  );
}
