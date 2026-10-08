import { Schema, model, models, Model, Types } from "mongoose";
import { CALL_OUTCOMES } from "@/lib/sales";
import type { CallOutcome } from "@/lib/sales";

/**
 * Every touch on a lead — the lead's chronological timeline AND the raw
 * material for every report/dashboard number (calls, connects, outcomes).
 */
export type ActivityType =
  | "lead_created"
  | "imported"
  | "assigned"
  | "call"
  | "whatsapp"
  | "email"
  | "note"
  | "follow_up_created"
  | "follow_up_completed"
  | "follow_up_rescheduled"
  | "meeting_booked"
  | "meeting_outcome"
  | "meeting_rescheduled"
  | "stage_change"
  | "proposal_sent";

export const ACTIVITY_TYPES: ActivityType[] = [
  "lead_created",
  "imported",
  "assigned",
  "call",
  "whatsapp",
  "email",
  "note",
  "follow_up_created",
  "follow_up_completed",
  "follow_up_rescheduled",
  "meeting_booked",
  "meeting_outcome",
  "meeting_rescheduled",
  "stage_change",
  "proposal_sent",
];

export interface IActivity {
  _id: Types.ObjectId;
  leadId: Types.ObjectId;
  userId: Types.ObjectId;
  type: ActivityType;
  /** Only for type "call". */
  outcome?: CallOutcome | null;
  /** True for calls where someone actually picked up (not no-answer/busy/wrong number). */
  connected?: boolean;
  summary: string;
  notes?: string;
  productId?: Types.ObjectId | null;
  meta?: Record<string, unknown>;
  /**
   * Call-report columns (type "call" only) — one Activity row is one row of
   * the Telecaller Daily Call Report (see lib/callReport.ts).
   */
  callType?: "New Lead" | "Follow-up" | null;
  callStatus?: string | null;
  durationMins?: number | null;
  productIds?: Types.ObjectId[];
  leadType?: string | null;
  temperature?: string | null;
  reason?: string | null;
  nextAction?: string | null;
  followUpAt?: Date | null;
  createdAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    outcome: { type: String, enum: [...CALL_OUTCOMES, null], default: null },
    connected: { type: Boolean, default: false },
    summary: { type: String, required: true },
    notes: { type: String, default: "" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    meta: { type: Schema.Types.Mixed, default: {} },
    callType: { type: String, default: null },
    callStatus: { type: String, default: null },
    durationMins: { type: Number, default: null, min: 0 },
    productIds: { type: [Schema.Types.ObjectId], ref: "Product", default: undefined },
    leadType: { type: String, default: null },
    temperature: { type: String, default: null },
    reason: { type: String, default: null },
    nextAction: { type: String, default: null },
    followUpAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ActivitySchema.index({ userId: 1, type: 1, createdAt: -1 });
ActivitySchema.index({ type: 1, createdAt: -1 });

const Activity: Model<IActivity> = models.Activity || model<IActivity>("Activity", ActivitySchema);
export default Activity;
