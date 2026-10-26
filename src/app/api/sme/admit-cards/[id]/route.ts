import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { saveAdmitDetails } from "@/lib/services/admit";

export const PUT = route(async (req, ctx) => {
  const s = await requireRole("sme");
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, admit: await saveAdmitDetails(s, id, await readJson(req)) });
});
