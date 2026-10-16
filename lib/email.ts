import "server-only";
import { emailConfigured } from "@/lib/env";

export type SendResult = { ok: true; id: string } | { ok: false; transient: boolean; error: string };

/** Resend over HTTPS. The Idempotency-Key makes a retry of the same notification safe (Resend dedupes for 24h). */
export async function sendEmail(p: { to: string; subject: string; text: string; html: string; idempotencyKey: string }): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, transient: false, error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM)." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": p.idempotencyKey.slice(0, 256) },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [p.to], subject: p.subject, text: p.text, html: p.html }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok && data.id) return { ok: true, id: data.id };
    return { ok: false, transient: res.status === 429 || res.status >= 500, error: `Provider error ${res.status}: ${String(data.message ?? "no details").slice(0, 160)}` };
  } catch (e) {
    return { ok: false, transient: true, error: `Could not reach the email provider (${(e as Error).name}).` };
  }
}
