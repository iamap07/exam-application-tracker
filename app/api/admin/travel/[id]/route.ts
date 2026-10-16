import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { createTravelRecord, updateTravel } from "@/lib/services/travel";

export const PATCH = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, travel: await updateTravel(s, id, await readJson(req)) });
});
export const POST = route(async (_req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, travel: await createTravelRecord(s, id) }, { status: 201 });
});
