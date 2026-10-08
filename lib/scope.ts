import type { IUser } from "@/models/User";
import type { ILead } from "@/models/Lead";

export function isManager(user: Pick<IUser, "role"> | null | undefined) {
  return !!user && (user.role === "admin" || user.role === "manager");
}

/** Mongo filter for the leads a user may see: managers see all, telemarketers only their own. */
export function leadScope(user: IUser): Record<string, unknown> {
  if (isManager(user)) return {};
  return { assignedTo: user._id };
}

export function canAccessLead(user: IUser, lead: Pick<ILead, "assignedTo">) {
  if (isManager(user)) return true;
  return !!lead.assignedTo && String(lead.assignedTo) === String(user._id);
}
