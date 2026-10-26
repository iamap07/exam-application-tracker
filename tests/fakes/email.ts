import { emailConfigured } from "@/lib/env";
import { emailState as E } from "./state";
export async function sendEmail(p: { to: string; subject: string; text: string; html: string; idempotencyKey: string }) {
  if (!emailConfigured()) return { ok: false as const, transient: false, error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM)." };
  E.attempts++;
  if (E.mode === "transient") return { ok: false as const, transient: true, error: "Provider error 503: down" };
  if (E.mode === "permanent") return { ok: false as const, transient: false, error: "Provider error 422: invalid address" };
  E.sent.push({ to: p.to, subject: p.subject, key: p.idempotencyKey });
  return { ok: true as const, id: `em_${E.sent.length}` };
}
