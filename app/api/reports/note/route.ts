import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { DailyNote } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth } from "@/lib/auth";
import { dayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** GET /api/reports/note?date= — the caller's end-of-day comment. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const date = req.nextUrl.searchParams.get("date") || dayKey();
  const note = await DailyNote.findOne({ userId: user!._id, date }).lean();
  return ok({ date, comment: note?.comment ?? "" });
});

const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), comment: z.string().max(3000) });

/** PUT /api/reports/note — save the caller's end-of-day comment (the numbers are generated automatically). */
export const PUT = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const date = parsed.data.date || dayKey();
  const note = await DailyNote.findOneAndUpdate(
    { userId: user!._id, date },
    { comment: parsed.data.comment },
    { upsert: true, new: true }
  ).lean();
  return ok(note);
});
