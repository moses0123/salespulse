import { Schema, model, models, Model, Types } from "mongoose";
import { LEAD_STAGES, LEAD_SOURCES, TEMPERATURES, CALL_OUTCOMES } from "@/lib/sales";
import type { LeadStage, LeadSource, Temperature, CallOutcome, NextActionType } from "@/lib/sales";

export interface ILead {
  _id: Types.ObjectId;
  /** The lead's name — with the phone number, the only required information. */
  name: string;
  phone: string;
  /** Optional — many leads are individuals, or arrive without a company. */
  companyName?: string;
  /** Lower-cased, punctuation/suffix-stripped company name — used for duplicate detection ("" when no company). */
  companyKey?: string;
  /** Digits-only, country-code-prefixed phone — used for duplicate detection. */
  phoneKey: string;
  phoneValid: boolean;
  email?: string;
  industry?: string;
  location?: string;
  website?: string;
  productId?: Types.ObjectId | null;
  source: LeadSource;
  assignedTo?: Types.ObjectId | null;
  assignedAt?: Date | null;
  stage: LeadStage;
  temperature: Temperature;
  /** 0–100, see lib/sales.ts SCORE rules. */
  score: number;
  dealValue?: number | null;
  lostReason?: string | null;
  doNotContact: boolean;
  notes?: string;
  lastOutcome?: CallOutcome | null;
  lastContactAt?: Date | null;
  /** Denormalised from the lead's open follow-up / upcoming meeting — the "clear next action". */
  nextActionAt?: Date | null;
  nextActionType?: NextActionType | null;
  nextActionTitle?: string | null;
  lastActivityAt: Date;
  callCount: number;
  createdBy: Types.ObjectId;
  importBatch?: string | null;
  wonAt?: Date | null;
  lostAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const LeadSchema = new Schema<ILead>(
  {
    name: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true, default: "" },
    companyKey: { type: String, default: "", index: true },
    phone: { type: String, required: true, trim: true },
    phoneKey: { type: String, required: true, index: true },
    phoneValid: { type: Boolean, default: true },
    email: { type: String, trim: true, lowercase: true, default: "" },
    industry: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    source: { type: String, enum: LEAD_SOURCES, default: "Other" },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    assignedAt: { type: Date, default: null },
    stage: { type: String, enum: LEAD_STAGES, default: "New", index: true },
    temperature: { type: String, enum: TEMPERATURES, default: "Cold" },
    score: { type: Number, default: 0, min: 0, max: 100 },
    dealValue: { type: Number, default: null },
    lostReason: { type: String, default: null },
    doNotContact: { type: Boolean, default: false },
    notes: { type: String, default: "" },
    lastOutcome: { type: String, enum: [...CALL_OUTCOMES, null], default: null },
    lastContactAt: { type: Date, default: null },
    nextActionAt: { type: Date, default: null, index: true },
    nextActionType: { type: String, enum: ["follow_up", "meeting", null], default: null },
    nextActionTitle: { type: String, default: null },
    lastActivityAt: { type: Date, default: () => new Date() },
    callCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    importBatch: { type: String, default: null },
    wonAt: { type: Date, default: null },
    lostAt: { type: Date, default: null },
  },
  { timestamps: true }
);

LeadSchema.index({ assignedTo: 1, stage: 1 });
LeadSchema.index({ companyName: "text", name: "text", email: "text" });

const Lead: Model<ILead> = models.Lead || model<ILead>("Lead", LeadSchema);
export default Lead;
