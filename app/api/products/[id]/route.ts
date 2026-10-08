import { NextRequest } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/db";
import { Product, Lead } from "@/models";
import { ok, fail, withErrorHandling } from "@/lib/api";
import { getSessionUser, requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
interface P { params: { id: string } }

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withErrorHandling(async (req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireRole(user, ["admin", "manager"]);
  if (denied) return denied;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return fail("Invalid input", 422, parsed.error.flatten());
  const product = await Product.findByIdAndUpdate(params.id, parsed.data, { new: true }).lean();
  if (!product) return fail("Product not found", 404);
  return ok(product);
});

/** DELETE — only if no lead references it; otherwise deactivate instead. */
export const DELETE = withErrorHandling(async (_req: NextRequest, { params }: P) => {
  await connectDB();
  const user = await getSessionUser();
  const denied = requireRole(user, ["admin", "manager"]);
  if (denied) return denied;
  if (await Lead.exists({ productId: params.id })) {
    return fail("Leads reference this product — deactivate it instead so their history stays intact.", 409);
  }
  await Product.deleteOne({ _id: params.id });
  return ok({ deleted: true });
});
