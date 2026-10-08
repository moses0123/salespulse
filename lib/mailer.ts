import nodemailer from "nodemailer";
import { getSettingsWithSecrets, isSmtpConfigured } from "@/lib/settings";

/**
 * Send a real email via the SMTP server configured on the Settings page.
 * Returns { sent: false, reason: "not_configured" } rather than throwing
 * when SMTP isn't set up yet — callers (lib/notifications.ts) fall back to
 * the original simulated behavior in that case, so the app works fully
 * before an admin fills in real credentials.
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const settings = await getSettingsWithSecrets();
  if (!isSmtpConfigured(settings)) {
    return { sent: false, reason: "not_configured" };
  }

  const transporter = nodemailer.createTransport({
    host: settings!.smtp.host!,
    port: settings!.smtp.port!,
    secure: !!settings!.smtp.secure,
    auth: settings!.smtp.username
      ? { user: settings!.smtp.username, pass: settings!.smtp.password ?? undefined }
      : undefined,
  });

  const fromName = settings!.smtp.fromName || "SalesPulse";
  const fromEmail = settings!.smtp.fromEmail!;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });

  return { sent: true };
}
