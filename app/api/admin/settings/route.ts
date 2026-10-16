import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { getConfig, setConfig } from "@/lib/sheets/store";
import { audit } from "@/lib/audit";

export const PUT = route(async (req) => {
  const s = await requireRole("super_admin");
  const { ops_can_view_financial } = z.object({ ops_can_view_financial: z.boolean() }).parse(await readJson(req));
  const before = await getConfig("ops_can_view_financial");
  await setConfig("ops_can_view_financial", String(ops_can_view_financial), s.email);
  await audit(s, "settings.permissions", "SETTINGS", "ops_can_view_financial", "success", { value: before }, { value: ops_can_view_financial });
  return NextResponse.json({ ok: true });
});
