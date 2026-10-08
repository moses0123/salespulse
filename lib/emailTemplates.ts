/**
 * Branded HTML for outbound notification emails. lib/notifications.ts sends
 * this alongside the existing plain-text body — nodemailer attaches both,
 * and each mail client picks whichever it supports, so nothing regresses
 * for a client that can't render HTML.
 *
 * Deliberately a single table-based layout with inline styles and no
 * external fonts/images/CSS: that's what renders consistently across
 * Gmail, Outlook (desktop and web), and mobile mail apps, which all strip
 * or mangle a more "web" approach (external stylesheets, flexbox, webfonts).
 */
export function renderNotificationEmailHtml(params: { heading: string; message: string }): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#5b21b6;padding:20px 28px;">
                <span style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.01em;">SalesPulse</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 14px;color:#111827;font-size:16px;font-weight:600;line-height:1.4;">${escape(params.heading)}</p>
                <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">${escape(params.message)}</p>
                <a href="${appUrl}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 22px;border-radius:8px;">Open SalesPulse</a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 24px;border-top:1px solid #f0f0f0;">
                <p style="margin:0;color:#9ca3af;font-size:11.5px;line-height:1.5;">
                  You're receiving this because you have an account on SalesPulse.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
