import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { parseRange } from "@/lib/time";
import { buildCallReport } from "@/lib/callReport";
import { callReportWorkbook } from "@/lib/callReportXlsx";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/call-report?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=&format=json
 *
 * The Telecaller Daily Call Report. Default: the .xlsx in the team's
 * original layout (Dashboard + Lists + one sheet per telecaller).
 * format=json: the same numbers for the Reports page.
 * Managers/Super Admins get every telecaller; telemarketers only themselves.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const { start, end } = parseRange(sp.get("from"), sp.get("to"));
  const report = await buildCallReport(user!, start, end, sp.get("userId"));

  if (sp.get("format") === "json") {
    // Rows are only needed in the file; keep the JSON light.
    return ok({ ...report, telecallers: report.telecallers.map(({ rows, ...t }) => ({ ...t, rowCount: rows.length })) });
  }

  const buf = await callReportWorkbook(report);
  const label = report.from === report.to ? report.from : `${report.from}_to_${report.to}`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Telecaller_Daily_Call_Report_${label}.xlsx"`,
    },
  });
});
