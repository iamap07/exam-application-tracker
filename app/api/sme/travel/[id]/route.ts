import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { confirmTravel } from "@/lib/services/travel";

export const POST = route(async (_req, ctx) => {
  const s = await requireRole("sme");
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, travel: await confirmTravel(s, id) });
});
