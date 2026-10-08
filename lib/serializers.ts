import { aliasPopulated, aliasPopulatedMany } from "@/lib/serialize";

export const LEAD_POPULATE = [
  { path: "assignedTo", select: "name role" },
  { path: "productId", select: "name" },
];
export const leadAlias = { assignedTo: "assignee", productId: "product" };
export const serializeLead = (d: any) => aliasPopulated(d, leadAlias);
export const serializeLeads = (d: any[]) => aliasPopulatedMany(d, leadAlias);

export const FOLLOW_UP_POPULATE = [
  { path: "leadId", select: "companyName name phone phoneKey stage temperature industry" },
  { path: "assignedTo", select: "name role" },
];
export const followUpAlias = { leadId: "lead", assignedTo: "assignee" };
export const serializeFollowUps = (d: any[]) => aliasPopulatedMany(d, followUpAlias);

export const MEETING_POPULATE = [
  { path: "leadId", select: "companyName name phone phoneKey stage" },
  { path: "ownerId", select: "name role" },
  { path: "productId", select: "name" },
];
export const meetingAlias = { leadId: "lead", ownerId: "owner", productId: "product" };
export const serializeMeetings = (d: any[]) => aliasPopulatedMany(d, meetingAlias);

export const serializeActivities = (d: any[]) => aliasPopulatedMany(d, { userId: "user" });
