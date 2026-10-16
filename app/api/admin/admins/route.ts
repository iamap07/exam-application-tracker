import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { inviteAdmin } from "@/lib/services/smes";

// Super Admin only: invites an Operations admin by email (role is set server-side in Supabase app_metadata).
export const POST = route(async (req) => {
  const s = await requireRole("super_admin");
  const { email } = (await readJson(req)) as { email?: unknown };
  await inviteAdmin(s, email);
  return NextResponse.json({ ok: true });
});
