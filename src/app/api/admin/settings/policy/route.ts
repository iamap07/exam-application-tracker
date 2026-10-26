import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { setConfig } from "@/lib/sheets/store";
import { audit } from "@/lib/audit";

const body = z.object({
  readiness_windows: z.string().trim().regex(/^\d{1,2}(\s*,\s*\d{1,2})*$/, "Enter days separated by commas, e.g. 30,14,7,3,1"),
  reimb_overdue_days: z.string().trim().regex(/^\d{1,3}$/, "Enter a whole number of days"),
});
export const PUT = route(async (req) => {
  const s = await requireRole("super_admin");
  const b = body.parse(await readJson(req));
  await setConfig("readiness_windows", b.readiness_windows.replace(/\s/g, ""), s.email);
  await setConfig("reimb_overdue_days", b.reimb_overdue_days, s.email);
  await audit(s, "settings.policy", "SETTINGS", "policy", "success", undefined, b);
  return NextResponse.json({ ok: true });
});
