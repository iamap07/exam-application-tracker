import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { reviewDocument } from "@/lib/services/documents";

const body = z.object({ action: z.enum(["verify", "request_correction", "reject"]), reason: z.string().max(500).optional().default("") });
export const POST = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  const b = body.parse(await readJson(req));
  return NextResponse.json({ ok: true, document: await reviewDocument(s, id, b.action, b.reason) });
});
