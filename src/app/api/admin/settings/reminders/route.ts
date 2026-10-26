import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { HttpError, route, readJson } from "@/lib/http";
import { setConfig } from "@/lib/sheets/store";
import { fromFlat } from "@/lib/reminders";
import { audit } from "@/lib/audit";

export const PUT = route(async (req) => {
  const s = await requireRole("super_admin");
  const r = fromFlat((await readJson(req)) as Record<string, string>);
  if (!r.ok) throw new HttpError(400, "Some fields need attention.", { fields: r.fields });
  await setConfig("reminder_config", JSON.stringify(r.config), s.email);
  await audit(s, "settings.reminders", "SETTINGS", "reminder_config", "success", undefined, r.config);
  return NextResponse.json({ ok: true });
});
