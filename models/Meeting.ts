import { Schema, model, models, Model, Types } from "mongoose";
import { MEETING_OUTCOMES } from "@/lib/sales";
import type { MeetingOutcome } from "@/lib/sales";

export type MeetingStatus = "Scheduled" | "Completed" | "Cancelled";
export const MEETING_TYPES = ["Demo", "Discovery", "Proposal Review", "Negotiation", "Other"] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export interface IMeeting {
  _id: Types.ObjectId;
  leadId: Types.ObjectId;
  ownerId: Types.ObjectId;
  createdBy: Types.ObjectId;
  type: MeetingType;
  scheduledAt: Date;
  durationMins: number;
  location?: string;
  productId?: Types.ObjectId | null;
  agenda?: string;
  status: MeetingStatus;
  outcome?: MeetingOutcome | null;
  outcomeNotes?: string;
  outcomeAt?: Date | null;
  rescheduleCount: number;
  reminderSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: MEETING_TYPES, default: "Demo" },
    scheduledAt: { type: Date, required: true },
    durationMins: { type: Number, default: 60 },
    location: { type: String, default: "" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    agenda: { type: String, default: "" },
    status: { type: String, enum: ["Scheduled", "Completed", "Cancelled"], default: "Scheduled" },
    outcome: { type: String, enum: [...MEETING_OUTCOMES, null], default: null },
    outcomeNotes: { type: String, default: "" },
    outcomeAt: { type: Date, default: null },
    rescheduleCount: { type: Number, default: 0 },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

MeetingSchema.index({ ownerId: 1, status: 1, scheduledAt: 1 });
MeetingSchema.index({ status: 1, scheduledAt: 1 });

const Meeting: Model<IMeeting> = models.Meeting || model<IMeeting>("Meeting", MeetingSchema);
export default Meeting;
