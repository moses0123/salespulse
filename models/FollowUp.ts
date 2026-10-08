import { Schema, model, models, Model, Types } from "mongoose";

export type FollowUpStatus = "Pending" | "Completed" | "Cancelled";
export const FOLLOW_UP_CHANNELS = ["call", "whatsapp", "email", "visit"] as const;
export type FollowUpChannel = (typeof FOLLOW_UP_CHANNELS)[number];

/** A scheduled next action on a lead — "the system should never rely on memory". */
export interface IFollowUp {
  _id: Types.ObjectId;
  leadId: Types.ObjectId;
  assignedTo: Types.ObjectId;
  createdBy: Types.ObjectId;
  title: string;
  channel: FollowUpChannel;
  dueAt: Date;
  status: FollowUpStatus;
  completedAt?: Date | null;
  completedBy?: Types.ObjectId | null;
  completionNote?: string;
  rescheduleCount: number;
  reminderSentAt?: Date | null;
  escalatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const FollowUpSchema = new Schema<IFollowUp>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    channel: { type: String, enum: FOLLOW_UP_CHANNELS, default: "call" },
    dueAt: { type: Date, required: true },
    status: { type: String, enum: ["Pending", "Completed", "Cancelled"], default: "Pending" },
    completedAt: { type: Date, default: null },
    completedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    completionNote: { type: String, default: "" },
    rescheduleCount: { type: Number, default: 0 },
    reminderSentAt: { type: Date, default: null },
    escalatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

FollowUpSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });
FollowUpSchema.index({ status: 1, dueAt: 1 });

const FollowUp: Model<IFollowUp> = models.FollowUp || model<IFollowUp>("FollowUp", FollowUpSchema);
export default FollowUp;
