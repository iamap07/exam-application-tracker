import { NextResponse } from "next/server";
import { redact } from "@/lib/redact";
import { AuthError, requireRole } from "@/lib/auth/session";
import { ensureSchema } from "@/lib/sheets/store";

// Super Admin only. Creates missing tabs/headers; never overwrites mismatched tabs.
export async function POST() {
  try {
    await requireRole("super_admin");
    const report = await ensureSchema();
    const ok = report.every((r) => r.status !== "mismatch");
    return NextResponse.json({ ok, report }, { status: ok ? 200 : 409 });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    console.error("init-schema failed:", redact((e as Error).message));
    return NextResponse.json({ ok: false, error: "Schema initialisation failed. Check Google credentials and sharing." }, { status: 500 });
  }
}
