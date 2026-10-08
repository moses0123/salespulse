import { getSettingsWithSecrets, isWhatsAppConfigured } from "@/lib/settings";

/** Fills `{{token}}` placeholders in a header/body-field value with the given variables. Unknown tokens are left blank. */
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, token: string) =>
    token in vars ? vars[token] : ""
  );
}

/**
 * Send a WhatsApp message via a generic, admin-configured HTTP webhook (the
 * Settings page — Endpoint URL, Method, Headers, Body fields) rather than a
 * single hardcoded provider's API shape, matching the WhatsApp automation
 * setup already used on other Marichi Solutions products. Header and body
 * field *values* can contain `{{phone}}`, `{{message}}`, and `{{name}}`
 * placeholders — e.g. a body field `destination` → `{{phone}}` — which are
 * filled in with this notification's actual values before the request goes
 * out.
 *
 * Returns { sent: false, reason: "not_configured" } rather than throwing
 * when the webhook isn't set up yet — callers (lib/notifications.ts) fall
 * back to the original simulated behavior in that case. A real send
 * failure (bad token, unreachable endpoint, provider error) throws with the
 * provider's own response so it surfaces as a clear failureReason on the
 * NotificationLog.
 */
export async function sendWhatsApp(params: {
  to: string;
  message: string;
  name?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const settings = await getSettingsWithSecrets();
  if (!isWhatsAppConfigured(settings)) {
    return { sent: false, reason: "not_configured" };
  }

  const vars: Record<string, string> = {
    phone: params.to,
    message: params.message,
    name: params.name ?? "",
  };

  const headers: Record<string, string> = {};
  for (const h of settings!.whatsapp.headers ?? []) {
    if (!h.key) continue;
    headers[h.key] = fillTemplate(h.value ?? "", vars);
  }

  const method = settings!.whatsapp.method || "POST";
  let body: string | undefined;
  if (method !== "GET") {
    const bodyObj: Record<string, string> = {};
    for (const f of settings!.whatsapp.bodyFields ?? []) {
      if (!f.key) continue;
      bodyObj[f.key] = fillTemplate(f.value ?? "", vars);
    }
    body = JSON.stringify(bodyObj);
    if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) {
      headers["Content-Type"] = "application/json";
    }
  }

  const res = await fetch(settings!.whatsapp.endpointUrl!, { method, headers, body });

  if (!res.ok) {
    let reason = `WhatsApp webhook error (${res.status})`;
    try {
      const text = await res.text();
      if (text) reason = text.slice(0, 300);
    } catch {
      // Response body wasn't readable — keep the generic reason.
    }
    throw new Error(reason);
  }

  return { sent: true };
}
