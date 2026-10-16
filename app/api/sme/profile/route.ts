import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { updateOwnProfile } from "@/lib/services/smes";

export const PATCH = route(async (req) => {
  const s = await requireRole("sme");
  return NextResponse.json({ ok: true, sme: await updateOwnProfile(s, await readJson(req)) });
});
