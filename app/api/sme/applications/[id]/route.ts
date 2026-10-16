import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { getOwnApplication, saveOwnApplication } from "@/lib/services/applications";

// The path id is an assignment id; ownership is verified against the session's SME, never a client-supplied SME id.
export const GET = route(async (_req, ctx) => {
  const s = await requireRole("sme");
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, ...(await getOwnApplication(s, id)) });
});
export const PUT = route(async (req, ctx) => {
  const s = await requireRole("sme");
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, ...(await saveOwnApplication(s, id, await readJson(req))) });
});
