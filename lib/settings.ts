import { Settings } from "@/models";
import type { ISettings } from "@/models/Settings";

/**
 * Fetch the singleton Settings document, including its normally-hidden
 * secret fields (smtp.password, whatsapp.accessToken) — for server-side use
 * only (lib/mailer.ts, lib/whatsapp.ts). Never expose this result directly
 * to the client; the /api/settings GET route returns a redacted shape
 * instead (see app/api/settings/route.ts).
 */
export async function getSettingsWithSecrets(): Promise<ISettings | null> {
  const doc = await Settings.findById("singleton").select("+smtp.password").lean();
  return doc as ISettings | null;
}

export function isSmtpConfigured(settings: ISettings | null): boolean {
  return !!(settings?.smtp?.host && settings.smtp.port && settings.smtp.fromEmail);
}

/** Configured once there's an endpoint to call and at least one body field to put the recipient/message into. */
export function isWhatsAppConfigured(settings: ISettings | null): boolean {
  return !!(settings?.whatsapp?.endpointUrl && (settings.whatsapp.bodyFields?.length ?? 0) > 0);
}
