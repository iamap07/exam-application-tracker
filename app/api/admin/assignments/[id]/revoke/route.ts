import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { revokeAssignment } from "@/lib/services/assignments";

export const POST = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  const { reason } = z.object({ reason: z.string().trim().min(3, "Enter a reason").max(500) }).parse(await readJson(req));
  return NextResponse.json({ ok: true, assignment: await revokeAssignment(s, id, reason) });
});
