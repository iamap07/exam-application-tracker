import { after, NextResponse } from "next/server";
import { redact } from "@/lib/redact";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { assign } from "@/lib/services/assignments";
import { deliverPending } from "@/lib/services/notify";

export const maxDuration = 60;

export const POST = route(async (req) => {
  const s = await requireAdmin();
  const out = await assign(s, await readJson(req));
  after(async () => { try { await deliverPending({ limit: 15, retryFailed: false }); } catch (e) { console.error("post-assign delivery failed", redact((e as Error).message)); } });
  // 207 when some recipients failed so the UI can show partial results instead of a false success.
  return NextResponse.json({ ok: out.summary.failed === 0, ...out }, { status: out.summary.failed ? 207 : 201 });
});
