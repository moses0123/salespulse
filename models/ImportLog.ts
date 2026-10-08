import { Schema, model, models, Model, Types } from "mongoose";

/** One bulk upload — who uploaded which file, and what happened to its rows. */
export interface IImportLog {
  _id: Types.ObjectId;
  batch: string;
  fileName: string;
  uploadedBy: Types.ObjectId;
  total: number;
  imported: number;
  skipped: number;
  summary: Record<string, number>;
  assignment: { userId: string; name: string; count: number }[];
  createdAt: Date;
}

const ImportLogSchema = new Schema<IImportLog>(
  {
    batch: { type: String, required: true, index: true },
    fileName: { type: String, default: "" },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    total: { type: Number, default: 0 },
    imported: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    summary: { type: Schema.Types.Mixed, default: {} },
    assignment: { type: [{ userId: String, name: String, count: Number }], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ImportLogSchema.index({ uploadedBy: 1, createdAt: -1 });

const ImportLog: Model<IImportLog> = models.ImportLog || model<IImportLog>("ImportLog", ImportLogSchema);
export default ImportLog;
