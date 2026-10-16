import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { reviewReimbursement } from "@/lib/services/reimbursements";

export const POST = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, reimbursement: await reviewReimbursement(s, id, await readJson(req)) });
});
