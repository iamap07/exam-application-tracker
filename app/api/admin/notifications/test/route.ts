import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { sendTestEmail } from "@/lib/services/notify";

export const POST = route(async () => {
  const s = await requireAdmin();
  const r = await sendTestEmail(s);
  return NextResponse.json({ ok: r.ok, message: r.ok ? `Test email sent to ${s.email}. Check your inbox (and spam).` : `Test email failed: ${r.error}` });
});
