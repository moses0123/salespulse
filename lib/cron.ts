import "server-only";
import { NextRequest } from "next/server";
import { getSessionUser, requireRole } from "@/lib/auth";

/** Cron endpoints accept `Authorization: Bearer <CRON_SECRET>`, or (for manual runs) a signed-in Super Admin. */
export async function authorizeCron(req: NextRequest): Promise<Response | null> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return null;
  const user = await getSessionUser();
  return requireRole(user, ["admin"]);
}
