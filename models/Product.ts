import { Schema, model, models, Model, Types } from "mongoose";

/** A product/solution telemarketers pitch (e.g. "Sales CRM", "VisitFlow"). Managed on the Settings page. */
export interface IProduct {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Product: Model<IProduct> = models.Product || model<IProduct>("Product", ProductSchema);
export default Product;
