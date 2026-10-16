import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { deliverPending, deliverySummaryText } from "@/lib/services/notify";
import { audit } from "@/lib/audit";

export const maxDuration = 60;
export const POST = route(async (req) => {
  const s = await requireAdmin();
  const { notification_id } = z.object({ notification_id: z.string().optional() }).parse(await readJson(req));
  const d = await deliverPending({ limit: 15, retryFailed: true, manual: true, onlyId: notification_id });
  await audit(s, "notification.retry", "NOTIFICATION", notification_id ?? "all-failed", d.failed ? "failure" : "success", undefined, d);
  return NextResponse.json({ ok: d.failed === 0 && !d.notConfigured, message: deliverySummaryText(d) });
});
