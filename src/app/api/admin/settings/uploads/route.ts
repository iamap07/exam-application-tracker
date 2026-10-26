import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { setConfig } from "@/lib/sheets/store";
import { audit } from "@/lib/audit";
import { OPTIONAL_TYPES } from "@/lib/files";

const body = z.object({
  max_upload_mb: z.string().trim().regex(/^[1-4]$/, "Enter a whole number from 1 to 4 (hosting limit)"),
  extra_types: z.string().trim().max(40).refine((v) => v === "" || v.split(",").every((t) => OPTIONAL_TYPES.includes(t.trim().toLowerCase())), `Allowed extras: ${OPTIONAL_TYPES.join(", ")}`),
});
export const PUT = route(async (req) => {
  const s = await requireRole("super_admin");
  const b = body.parse(await readJson(req));
  await setConfig("max_upload_mb", b.max_upload_mb, s.email);
  await setConfig("extra_types", b.extra_types.toLowerCase().replace(/\s/g, ""), s.email);
  await audit(s, "settings.uploads", "SETTINGS", "uploads", "success", undefined, b);
  return NextResponse.json({ ok: true });
});
