import { after, NextResponse } from "next/server";
import { redact } from "@/lib/redact";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { deliverPending, sendManual } from "@/lib/services/notify";

export const maxDuration = 60;
export const POST = route(async (req) => {
  const s = await requireAdmin();
  const out = await sendManual(s, await readJson(req));
  if (out.result) after(async () => { try { await deliverPending({ limit: 15, retryFailed: false }); } catch (e) { console.error("post-send delivery failed", redact((e as Error).message)); } });
  return NextResponse.json({ ok: (out.result?.failed ?? 0) === 0, ...out });
});
