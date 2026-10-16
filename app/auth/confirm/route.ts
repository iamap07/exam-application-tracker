import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/auth/supabase";
import { activateOnLogin } from "@/lib/services/smes";

export async function GET(req: NextRequest) {
  const u = req.nextUrl;
  const code = u.searchParams.get("code"), tokenHash = u.searchParams.get("token_hash"), type = u.searchParams.get("type");
  const rawNext = u.searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/"; // block open redirects
  const sb = await supabaseServer();
  let failed = true;
  if (code) failed = !!(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) failed = !!(await sb.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash })).error;
  if (failed) return NextResponse.redirect(new URL("/login?error=link", u));
  const act = await activateOnLogin().catch(() => ({ ok: false, reason: "noaccess" }));
  if (!act.ok) { await sb.auth.signOut(); return NextResponse.redirect(new URL(`/login?error=${act.reason}`, u)); }
  return NextResponse.redirect(new URL(next, u));
}
