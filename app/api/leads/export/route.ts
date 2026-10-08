import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import connectDB from "@/lib/db";
import { Lead } from "@/models";
import { fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { leadScope } from "@/lib/scope";
import { LEAD_STAGES, OPEN_STAGES } from "@/lib/sales";
import { formatDateTimeShort } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** GET /api/leads/export?stage=&assignedTo= — the caller's visible leads as .xlsx. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = { ...leadScope(user!) };
  const stage = sp.get("stage");
  if (stage === "open") filter.stage = { $in: OPEN_STAGES };
  else if (stage && (LEAD_STAGES as readonly string[]).includes(stage)) filter.stage = stage;
  const assignedTo = sp.get("assignedTo");
  if (assignedTo && Object.keys(leadScope(user!)).length === 0) filter.assignedTo = assignedTo === "none" ? null : assignedTo;

  const leads = await Lead.find(filter).sort({ name: 1 }).populate("assignedTo", "name").populate("productId", "name").lean();
  if (leads.length > 50000) return fail("Too many leads to export at once — filter first", 400);

  const rows = leads.map((l: any) => ({
    "Lead Name": l.name,
    Company: l.companyName,
    Phone: l.phone,
    Email: l.email,
    Industry: l.industry,
    Location: l.location,
    Website: l.website,
    Product: l.productId?.name ?? "",
    Source: l.source,
    "Assigned To": l.assignedTo?.name ?? "",
    Stage: l.stage,
    Temperature: l.temperature,
    Score: l.score,
    "Deal Value": l.dealValue ?? "",
    "Last Outcome": l.lastOutcome ?? "",
    "Last Contact": l.lastContactAt ? formatDateTimeShort(l.lastContactAt) : "",
    "Next Action": l.nextActionTitle ?? "",
    "Next Action Due": l.nextActionAt ? formatDateTimeShort(l.nextActionAt) : "",
    Calls: l.callCount,
    "Do Not Contact": l.doNotContact ? "Yes" : "",
    "Lost Reason": l.lostReason ?? "",
    Notes: l.notes,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Leads");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="salespulse-leads-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
});
