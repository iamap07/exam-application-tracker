import { NextResponse } from "next/server";
import { checkEnv } from "@/lib/env";

// Public, non-sensitive: reports which variables are missing (names only) so setup problems are visible.
export async function GET() {
  const env = checkEnv();
  return NextResponse.json({ ok: env.ok, missingEnv: env.ok ? [] : env.missing });
}
