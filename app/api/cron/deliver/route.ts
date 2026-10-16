import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runJob } from "@/lib/services/jobs";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16) return false; // refuse to run unauthenticated if the secret is missing
  const a = Buffer.from(req.headers.get("authorization") ?? ""), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
// Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when the CRON_SECRET env var is set.
export async function GET(req: Request) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  const r = await runJob("deliver", "cron");
  return NextResponse.json(r, { status: r.ok || r.busy ? 200 : 500 });
}
