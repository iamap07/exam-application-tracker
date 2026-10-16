import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { previewAssignment } from "@/lib/services/assignments";

export const POST = route(async (req) => {
  await requireAdmin();
  return NextResponse.json({ ok: true, preview: await previewAssignment(await readJson(req)) });
});
