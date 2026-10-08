import { Schema, model, models, Model, Types } from "mongoose";

export type NotificationChannel = "in_app" | "whatsapp" | "email";
export type NotificationStatus = "queued" | "sent" | "failed";

export interface INotificationLog {
  _id: Types.ObjectId;
  recipientId: Types.ObjectId;
  leadId?: Types.ObjectId | null;
  /** Machine-readable kind, e.g. "follow_up_due", "escalation" — used for de-duplication. */
  kind: string;
  /** Optional idempotency key — a notification with the same key is never queued twice. */
  dedupeKey?: string | null;
  channel: NotificationChannel;
  message: string;
  status: NotificationStatus;
  failureReason?: string | null;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", default: null },
    kind: { type: String, default: "general" },
    dedupeKey: { type: String, default: null },
    channel: { type: String, enum: ["in_app", "whatsapp", "email"], required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ["queued", "sent", "failed"], required: true, default: "queued" },
    failureReason: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

NotificationLogSchema.index({ recipientId: 1, channel: 1, createdAt: -1 });
NotificationLogSchema.index({ dedupeKey: 1, channel: 1 });

const NotificationLog: Model<INotificationLog> =
  models.NotificationLog || model<INotificationLog>("NotificationLog", NotificationLogSchema);
export default NotificationLog;
