import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { updateExam } from "@/lib/services/exams";

export const PATCH = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  const { expected_updated_at, ...data } = (await readJson(req)) as Record<string, unknown>;
  return NextResponse.json({ ok: true, exam: await updateExam(s, id, data, expected_updated_at as string | undefined) });
});
