import connectDB from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { getSettingsWithSecrets } from "@/lib/settings";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/sales";

export const dynamic = "force-dynamic";

/** GET /api/sales-config — the non-secret sales settings every signed-in user needs (WhatsApp template). */
export const GET = withErrorHandling(async () => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const s = await getSettingsWithSecrets();
  return ok({
    whatsappTemplate: s?.sales?.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
    staleLeadHours: s?.sales?.staleLeadHours ?? 48,
  });
});
