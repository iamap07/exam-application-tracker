import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { createSme } from "@/lib/services/smes";

export const POST = route(async (req) => {
  const s = await requireAdmin();
  const result = await createSme(s, await readJson(req));
  return NextResponse.json({ ok: true, ...result }, { status: 201 });
});
