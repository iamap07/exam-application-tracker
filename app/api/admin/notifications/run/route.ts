import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { route, readJson } from "@/lib/http";
import { runJob } from "@/lib/services/jobs";

export const maxDuration = 60;
export const POST = route(async (req) => {
  await requireAdmin();
  const { job } = z.object({ job: z.enum(["reminders", "deliver"]) }).parse(await readJson(req));
  const r = await runJob(job, "manual"); // manual runs never count as proof that the scheduler works
  return NextResponse.json({ ok: r.ok, message: r.message });
});
