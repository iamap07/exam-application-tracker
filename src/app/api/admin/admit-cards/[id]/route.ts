import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { reviewAdmit } from "@/lib/services/admit";

export const POST = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  const out = await reviewAdmit(s, id, await readJson(req));
  return NextResponse.json({ ok: true, admit: out.admit, warning: out.warning });
});
