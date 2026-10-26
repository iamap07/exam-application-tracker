import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { reviewApplication } from "@/lib/services/applications";

const body = z.object({ action: z.enum(["start_review", "verify", "request_correction", "reject"]), reason: z.string().max(500).optional().default("") });
export const POST = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  const b = body.parse(await readJson(req));
  return NextResponse.json({ ok: true, application: await reviewApplication(s, id, b.action, b.reason) });
});
