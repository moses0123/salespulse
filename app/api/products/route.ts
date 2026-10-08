import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Product } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireAuth, requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** GET /api/products?all=1 — active products (all, incl. inactive, with ?all=1). Any signed-in user. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireAuth(user);
  if (denied) return denied;
  const all = req.nextUrl.searchParams.get("all") === "1";
  const products = await Product.find(all ? {} : { isActive: true }).sort({ name: 1 }).lean();
  return ok(products);
});

const schema = z.object({ name: z.string().trim().min(1), description: z.string().optional() });

/** POST /api/products — Admin/Manager. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireRole(user, ["admin", "manager"]);
  if (denied) return denied;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const product = await Product.create(parsed.data);
  return ok(product, 201);
});
