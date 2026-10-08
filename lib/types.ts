import type { UserRole } from "@/models/User";
import type { NotificationChannel, NotificationStatus } from "@/models/NotificationLog";
import type { LeadStage, LeadSource, Temperature, CallOutcome, MeetingOutcome, NextActionType } from "@/lib/sales";

/** Plain (serialized) shapes used on the client — Mongo ObjectIds become strings. */

export interface UserDTO {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  managerId?: string | null;
  dailyCallTarget: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UserLite = Pick<UserDTO, "_id" | "name" | "role">;

export interface ProductDTO {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface LeadDTO {
  _id: string;
  /** The lead's name (required). */
  name: string;
  /** Optional. */
  companyName?: string;
  phone: string;
  phoneKey: string;
  phoneValid: boolean;
  email?: string;
  industry?: string;
  location?: string;
  website?: string;
  productId?: string | null;
  product?: Pick<ProductDTO, "_id" | "name"> | null;
  source: LeadSource;
  assignedTo?: string | null;
  assignee?: UserLite | null;
  stage: LeadStage;
  temperature: Temperature;
  score: number;
  dealValue?: number | null;
  lostReason?: string | null;
  doNotContact: boolean;
  notes?: string;
  lastOutcome?: CallOutcome | null;
  lastContactAt?: string | null;
  nextActionAt?: string | null;
  nextActionType?: NextActionType | null;
  nextActionTitle?: string | null;
  lastActivityAt: string;
  callCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityDTO {
  _id: string;
  leadId: string;
  userId: string;
  user?: UserLite | null;
  type: string;
  outcome?: CallOutcome | null;
  connected?: boolean;
  summary: string;
  notes?: string;
  createdAt: string;
}

export interface FollowUpDTO {
  _id: string;
  leadId: string;
  lead?: Pick<LeadDTO, "_id" | "companyName" | "name" | "phone" | "phoneKey" | "stage" | "temperature" | "industry"> | null;
  assignedTo: string;
  assignee?: UserLite | null;
  title: string;
  channel: "call" | "whatsapp" | "email" | "visit";
  dueAt: string;
  status: "Pending" | "Completed" | "Cancelled";
  completedAt?: string | null;
  completionNote?: string;
  rescheduleCount: number;
  createdAt: string;
}

export interface MeetingDTO {
  _id: string;
  leadId: string;
  lead?: Pick<LeadDTO, "_id" | "companyName" | "name" | "phone" | "phoneKey" | "stage"> | null;
  ownerId: string;
  owner?: UserLite | null;
  type: string;
  scheduledAt: string;
  durationMins: number;
  location?: string;
  agenda?: string;
  productId?: string | null;
  product?: Pick<ProductDTO, "_id" | "name"> | null;
  status: "Scheduled" | "Completed" | "Cancelled";
  outcome?: MeetingOutcome | null;
  outcomeNotes?: string;
  rescheduleCount: number;
}

export interface DuplicateMatchDTO {
  _id: string;
  name: string;
  companyName?: string;
  phone: string;
  stage: LeadStage;
  assignee?: UserLite | null;
  lastContactAt?: string | null;
  nextActionAt?: string | null;
  nextActionTitle?: string | null;
  matchedOn: ("phone" | "company" | "email")[];
}

export interface LeadDetailDTO {
  lead: LeadDTO;
  activities: ActivityDTO[];
  followUps: FollowUpDTO[];
  meetings: MeetingDTO[];
}

export interface WebhookKVDTO {
  key: string;
  value: string;
}

export interface SettingsDTO {
  smtp: {
    host: string | null;
    port: number | null;
    secure: boolean;
    username: string | null;
    fromName: string | null;
    fromEmail: string | null;
    passwordSet: boolean;
  };
  whatsapp: {
    endpointUrl: string | null;
    method: "GET" | "POST" | "PUT" | "PATCH";
    headers: WebhookKVDTO[];
    bodyFields: WebhookKVDTO[];
  };
  sales: {
    whatsappTemplate: string;
    staleLeadHours: number;
    escalateAfterHours: number;
    alertEmail: boolean;
    alertWhatsApp: boolean;
  };
}

export interface NotificationLogDTO {
  _id: string;
  recipientId: string;
  leadId?: string | null;
  kind: string;
  channel: NotificationChannel;
  message: string;
  status: NotificationStatus;
  readAt?: string | null;
  createdAt: string;
}

/** The numbers every report/dashboard is built from (§15). */
export interface ActivityMetrics {
  callsAttempted: number;
  connected: number;
  noAnswer: number;
  busy: number;
  wrongNumber: number;
  interested: number;
  notInterested: number;
  followUpsCreated: number;
  followUpsCompleted: number;
  meetingsBooked: number;
  meetingsHeld: number;
  demosCompleted: number;
  proposalsRequested: number;
  proposalsSent: number;
  converted: number;
}

export interface QueueDTO {
  user: UserLite & { dailyCallTarget: number };
  today: ActivityMetrics;
  overdue: FollowUpDTO[];
  dueToday: FollowUpDTO[];
  meetingsToday: MeetingDTO[];
  newLeads: LeadDTO[];
  hotLeads: LeadDTO[];
  newLeadsTotal: number;
  whatsappTemplate: string;
}

export interface TeamRow extends ActivityMetrics {
  user: UserLite;
  leadsAssigned: number;
  overdueFollowUps: number;
  contactRate: number | null;
  interestRate: number | null;
  meetingRate: number | null;
}

export interface BreakdownRow {
  key: string;
  leads: number;
  interested: number;
  meetings: number;
  won: number;
  pipelineValue: number;
}

export interface DashboardDTO {
  range: { from: string; to: string };
  totals: ActivityMetrics & {
    totalLeads: number;
    openLeads: number;
    newLeadsInRange: number;
    overdueFollowUps: number;
    staleLeads: number;
    unassignedLeads: number;
    pipelineValue: number;
  };
  funnel: { label: string; value: number }[];
  rates: {
    contactRate: number | null;
    interestRate: number | null;
    meetingConversion: number | null;
    proposalConversion: number | null;
    customerConversion: number | null;
    leadToCustomer: number | null;
    activitiesPerConversion: number | null;
  };
  team: TeamRow[];
  byStage: { stage: LeadStage; count: number; value: number }[];
  byProduct: BreakdownRow[];
  byIndustry: BreakdownRow[];
  bySource: BreakdownRow[];
  staleSample: LeadDTO[];
  overdueSample: FollowUpDTO[];
}

export interface DailyReportDTO {
  date: string;
  rows: (ActivityMetrics & { user: UserLite; leadsAssigned: number; comment: string })[];
  totals: ActivityMetrics & { leadsAssigned: number };
}
