import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Settings } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireRole } from "@/lib/auth";
import { getSettingsWithSecrets } from "@/lib/settings";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/sales";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings
 * Super Admin only. SMTP's secret (password) is redacted — never sent back
 * to the browser, just a `passwordSet` boolean so the Settings page can
 * show "configured" without round-tripping it. WhatsApp is a generic HTTP
 * webhook config (endpoint/method/headers/body fields) that the admin needs
 * to see and edit in full — including header values like an Authorization
 * token — so unlike SMTP it is NOT redacted, the same way the equivalent
 * screen on other Marichi Solutions products shows it. This stays fine
 * because the Settings page itself, and this route, are Super Admin only.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireRole(user, ["admin"]);
  if (denied) return denied;

  const settings = await getSettingsWithSecrets();

  return ok({
    smtp: {
      host: settings?.smtp?.host ?? null,
      port: settings?.smtp?.port ?? null,
      secure: settings?.smtp?.secure ?? false,
      username: settings?.smtp?.username ?? null,
      fromName: settings?.smtp?.fromName ?? null,
      fromEmail: settings?.smtp?.fromEmail ?? null,
      passwordSet: !!settings?.smtp?.password,
    },
    whatsapp: {
      endpointUrl: settings?.whatsapp?.endpointUrl ?? null,
      method: settings?.whatsapp?.method ?? "POST",
      headers: settings?.whatsapp?.headers ?? [],
      bodyFields: settings?.whatsapp?.bodyFields ?? [],
    },
    sales: {
      whatsappTemplate: settings?.sales?.whatsappTemplate || DEFAULT_WHATSAPP_TEMPLATE,
      staleLeadHours: settings?.sales?.staleLeadHours ?? 48,
      escalateAfterHours: settings?.sales?.escalateAfterHours ?? 24,
      alertEmail: settings?.sales?.alertEmail ?? true,
      alertWhatsApp: settings?.sales?.alertWhatsApp ?? false,
    },
  });
});

const smtpSchema = z.object({
  host: z.string().trim().optional().nullable(),
  port: z.number().int().positive().optional().nullable(),
  secure: z.boolean().optional(),
  username: z.string().trim().optional().nullable(),
  /** Blank/omitted leaves the stored password unchanged — only a non-empty value overwrites it. */
  password: z.string().optional(),
  fromName: z.string().trim().optional().nullable(),
  fromEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
});

const webhookKVSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string().optional().default(""),
});

const whatsappSchema = z.object({
  endpointUrl: z.string().trim().optional().nullable(),
  method: z.enum(["GET", "POST", "PUT", "PATCH"]).optional(),
  headers: z.array(webhookKVSchema).optional(),
  bodyFields: z.array(webhookKVSchema).optional(),
});

const salesSchema = z.object({
  whatsappTemplate: z.string().max(1000).optional(),
  staleLeadHours: z.number().int().min(1).max(24 * 60).optional(),
  escalateAfterHours: z.number().int().min(1).max(24 * 30).optional(),
  alertEmail: z.boolean().optional(),
  alertWhatsApp: z.boolean().optional(),
});

const updateSchema = z.object({
  smtp: smtpSchema.optional(),
  sales: salesSchema.optional(),
  whatsapp: whatsappSchema.optional(),
});

/**
 * PATCH /api/settings
 * Super Admin only. Updates SMTP and/or WhatsApp config. SMTP's `password`
 * is write-only — send a non-empty string to change it, omit or send "" to
 * leave the stored one untouched. WhatsApp's `headers`/`bodyFields` are
 * full key/value lists sent by the Settings page's editor — each save
 * replaces the whole list with whatever rows the admin left in the form
 * (adding/removing a row client-side, then saving, is how a row is added
 * or removed — there's no per-row patch).
 */
export const PATCH = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireRole(user, ["admin"]);
  if (denied) return denied;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());

  const { smtp, whatsapp, sales } = parsed.data;

  const update: Record<string, unknown> = { updatedBy: user!._id };
  if (smtp) {
    if (smtp.host !== undefined) update["smtp.host"] = smtp.host || null;
    if (smtp.port !== undefined) update["smtp.port"] = smtp.port;
    if (smtp.secure !== undefined) update["smtp.secure"] = smtp.secure;
    if (smtp.username !== undefined) update["smtp.username"] = smtp.username || null;
    if (smtp.password) update["smtp.password"] = smtp.password;
    if (smtp.fromName !== undefined) update["smtp.fromName"] = smtp.fromName || null;
    if (smtp.fromEmail !== undefined) update["smtp.fromEmail"] = smtp.fromEmail || null;
  }
  if (whatsapp) {
    if (whatsapp.endpointUrl !== undefined) update["whatsapp.endpointUrl"] = whatsapp.endpointUrl || null;
    if (whatsapp.method !== undefined) update["whatsapp.method"] = whatsapp.method;
    if (whatsapp.headers !== undefined) update["whatsapp.headers"] = whatsapp.headers;
    if (whatsapp.bodyFields !== undefined) update["whatsapp.bodyFields"] = whatsapp.bodyFields;
  }

  if (sales) {
    for (const [k, v] of Object.entries(sales)) if (v !== undefined) update[`sales.${k}`] = v;
  }

  await Settings.findByIdAndUpdate("singleton", { $set: update }, { upsert: true, setDefaultsOnInsert: true });

  return ok({ saved: true });
});
