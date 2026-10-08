import { Schema, model, models, Model, Types } from "mongoose";

/**
 * SalesPulse roles:
 *  - admin        → Administrator / Management (everything, incl. users + settings)
 *  - manager      → Team Leader / Sales Manager (all leads, assignment, imports, reports)
 *  - telemarketer → works their own assigned leads and daily queue
 */
export type UserRole = "admin" | "manager" | "telemarketer";
export const USER_ROLES: UserRole[] = ["admin", "manager", "telemarketer"];

export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  /** WhatsApp number (with country code) — where WhatsApp notifications are sent; see lib/whatsapp.ts. */
  phone?: string;
  role: UserRole;
  /** Team leader / manager this person reports to — receives their escalations. */
  managerId?: Types.ObjectId | null;
  /** Calls per day this person is expected to make (shown on their daily workspace). */
  dailyCallTarget: number;
  /** bcrypt hash — never selected by default; see lib/auth.ts. */
  passwordHash: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, required: true, default: "telemarketer" },
    managerId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    dailyCallTarget: { type: Number, default: 40, min: 0 },
    passwordHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, required: true, default: true },
  },
  { timestamps: true }
);

UserSchema.index({ role: 1 });
UserSchema.index({ managerId: 1 });

const User: Model<IUser> = models.User || model<IUser>("User", UserSchema);
export default User;
