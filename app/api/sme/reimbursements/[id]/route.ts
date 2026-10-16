import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { saveClaim } from "@/lib/services/reimbursements";

export const PUT = route(async (req, ctx) => {
  const s = await requireRole("sme");
  const { id } = await ctx.params; // assignment id, ownership-checked in the service
  return NextResponse.json({ ok: true, reimbursement: await saveClaim(s, id, await readJson(req)) });
});
