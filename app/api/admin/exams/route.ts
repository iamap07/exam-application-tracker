import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { createExam } from "@/lib/services/exams";

export const POST = route(async (req) => {
  const s = await requireAdmin();
  return NextResponse.json({ ok: true, exam: await createExam(s, await readJson(req)) }, { status: 201 });
});
