import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import connectDB from "@/lib/db";
import { Activity } from "@/models";
import { withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { parseRange, dayKey } from "@/lib/time";
import { buildReport } from "@/lib/reports";
import { isManager } from "@/lib/scope";
import { OUTCOME_RULES, rate, formatRate, type CallOutcome } from "@/lib/sales";
import { formatDateTimeShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/export?from=&to=&userId= — .xlsx with a Summary sheet
 * (one row per telemarketer, §15 metrics + rates + end-of-day comments) and
 * an Activity sheet (every call/meeting/follow-up in the range).
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const { start, end } = parseRange(sp.get("from"), sp.get("to"));
  const { rows, totals } = await buildReport(user!, start, end, sp.get("userId"));

  const summary = [...rows, { ...totals, user: { name: "TOTAL" }, comment: "" }].map((r: any) => ({
    Telemarketer: r.user.name,
    "Open Leads": r.leadsAssigned,
    "Calls Attempted": r.callsAttempted,
    Connected: r.connected,
    "No Answer": r.noAnswer,
    Busy: r.busy,
    "Wrong Number": r.wrongNumber,
    Interested: r.interested,
    "Not Interested": r.notInterested,
    "Follow-ups Created": r.followUpsCreated,
    "Follow-ups Completed": r.followUpsCompleted,
    "Meetings Booked": r.meetingsBooked,
    "Meetings Held": r.meetingsHeld,
    "Proposals Requested": r.proposalsRequested,
    "Proposals Sent": r.proposalsSent,
    Converted: r.converted,
    "Contact Rate": formatRate(rate(r.connected, r.callsAttempted)),
    "Interest Rate": formatRate(rate(r.interested, r.connected)),
    Comment: r.comment ?? "",
  }));

  const actFilter: Record<string, unknown> = {
    createdAt: { $gte: start, $lt: end },
    type: { $in: ["call", "whatsapp", "email", "follow_up_created", "follow_up_completed", "meeting_booked", "meeting_outcome", "proposal_sent", "stage_change"] },
  };
  if (!isManager(user)) actFilter.userId = user!._id;
  else if (sp.get("userId")) actFilter.userId = sp.get("userId");
  const acts = await Activity.find(actFilter)
    .sort({ createdAt: 1 })
    .limit(20000)
    .populate("userId", "name")
    .populate({ path: "leadId", select: "companyName name phone industry productId", populate: { path: "productId", select: "name" } })
    .lean();

  const activity = acts.map((a: any) => ({
    "Date/Time": formatDateTimeShort(a.createdAt),
    "By": a.userId?.name ?? "",
    Type: a.type.replace(/_/g, " "),
    Outcome: a.outcome ? OUTCOME_RULES[a.outcome as CallOutcome]?.label ?? a.outcome : "",
    Lead: a.leadId?.name ?? "",
    Company: a.leadId?.companyName ?? "",
    Phone: a.leadId?.phone ?? "",
    Industry: a.leadId?.industry ?? "",
    Product: a.leadId?.productId?.name ?? "",
    Summary: a.summary,
    Notes: a.notes ?? "",
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(activity.length ? activity : [{ Note: "No activity in this range" }]), "Activity");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const label = dayKey(start) === dayKey(new Date(end.getTime() - 1)) ? dayKey(start) : `${dayKey(start)}-to-${dayKey(new Date(end.getTime() - 1))}`;
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="salespulse-report-${label}.xlsx"`,
    },
  });
});
