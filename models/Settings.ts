import { Schema, model, models, Model } from "mongoose";
import { DEFAULT_WHATSAPP_TEMPLATE } from "@/lib/sales";

/** One header or body-field row in the WhatsApp webhook config — a plain key/value pair. */
export interface IWebhookKV {
  key: string;
  value: string;
}

/**
 * A single-document "singleton" collection (always _id: "singleton") for
 * org-wide integration config — SMTP (real email delivery) and a generic
 * WhatsApp HTTP webhook (real WhatsApp delivery). Admin-only, managed from
 * the Settings page. Until these are filled in, lib/mailer.ts and
 * lib/whatsapp.ts fall back to the original simulated "queued -> sent"
 * behavior, so the app works fully before anyone configures real delivery.
 *
 * WhatsApp is deliberately a generic "call this HTTP endpoint with these
 * headers/body" config rather than one hardcoded provider's API shape — it
 * mirrors the webhook-style setup already used for WhatsApp automations on
 * other Marichi Solutions products, so the same provider/account can be
 * reused here. Header/body field values may contain `{{phone}}`,
 * `{{message}}`, and `{{name}}` placeholders, filled in per notification —
 * see lib/whatsapp.ts.
 */
export interface ISettings {
  _id: string;
  smtp: {
    host?: string | null;
    port?: number | null;
    secure: boolean;
    username?: string | null;
    /** Plaintext in the DB — acceptable for a small internal/admin-only tool; see README for the tradeoff. */
    password?: string | null;
    fromName?: string | null;
    fromEmail?: string | null;
  };
  whatsapp: {
    endpointUrl?: string | null;
    method: "GET" | "POST" | "PUT" | "PATCH";
    headers: IWebhookKV[];
    bodyFields: IWebhookKV[];
  };
  /** Sales-operation preferences (Settings page → Sales). */
  sales: {
    /** Pre-filled WhatsApp text for the "WhatsApp" button on a lead. Supports {{contact}}, {{company}}, {{agent}}, {{product}}. */
    whatsappTemplate: string;
    /** A lead with no activity for this many hours is flagged as "gone quiet". */
    staleLeadHours: number;
    /** A follow-up overdue by this many hours is escalated to the assignee's manager. */
    escalateAfterHours: number;
    /** Also send staff alerts by email / WhatsApp (in-app is always on). */
    alertEmail: boolean;
    alertWhatsApp: boolean;
  };
  updatedBy?: Schema.Types.ObjectId | null;
  updatedAt: Date;
}



const WebhookKVSchema = new Schema<IWebhookKV>(
  {
    key: { type: String, required: true, trim: true },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const SettingsSchema = new Schema<ISettings>(
  {
    _id: { type: String, default: "singleton" },
    smtp: {
      host: { type: String, default: null },
      port: { type: Number, default: null },
      secure: { type: Boolean, default: false },
      username: { type: String, default: null },
      password: { type: String, default: null, select: false },
      fromName: { type: String, default: null },
      fromEmail: { type: String, default: null },
    },
    whatsapp: {
      endpointUrl: { type: String, default: null },
      method: { type: String, enum: ["GET", "POST", "PUT", "PATCH"], default: "POST" },
      headers: { type: [WebhookKVSchema], default: [] },
      bodyFields: { type: [WebhookKVSchema], default: [] },
    },
    sales: {
      whatsappTemplate: { type: String, default: DEFAULT_WHATSAPP_TEMPLATE },
      staleLeadHours: { type: Number, default: 48 },
      escalateAfterHours: { type: Number, default: 24 },
      alertEmail: { type: Boolean, default: true },
      alertWhatsApp: { type: Boolean, default: false },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

const Settings: Model<ISettings> = models.Settings || model<ISettings>("Settings", SettingsSchema);

export default Settings;
