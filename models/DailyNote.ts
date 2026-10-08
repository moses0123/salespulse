import { Schema, model, models, Model, Types } from "mongoose";

/** A telemarketer's optional end-of-day comment. The numbers themselves are always generated. */
export interface IDailyNote {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** "YYYY-MM-DD" in the app's timezone. */
  date: string;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const DailyNoteSchema = new Schema<IDailyNote>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true },
    comment: { type: String, default: "" },
  },
  { timestamps: true }
);

DailyNoteSchema.index({ userId: 1, date: 1 }, { unique: true });

const DailyNote: Model<IDailyNote> = models.DailyNote || model<IDailyNote>("DailyNote", DailyNoteSchema);
export default DailyNote;
