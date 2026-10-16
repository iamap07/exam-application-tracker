import "server-only";
import { z } from "zod";
import { SHEETS } from "@/lib/sheets/schema";
import { ConflictError, append, readAll, updateById, type Row } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { notifySme } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { appUrl, emailConfigured } from "@/lib/env";
import type { Session } from "@/lib/auth/session";
import { HttpError, safeMessage } from "@/lib/http";

const N = SHEETS.Notifications, LOG = SHEETS.Notification_Log, SME = SHEETS.SME_Master;
export const MAX_AUTO_ATTEMPTS = 5;
const STALE_SENDING_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function logAttempt(row: { notification_id?: string; channel: string; attempt?: number; status: string; error?: string; rule?: string }) {
  try { await append(LOG, { log_id: newId("AUD").replace("AUD", "LOG"), notification_id: row.notification_id ?? "", channel: row.channel, attempt: String(row.attempt ?? ""), status: row.status, error: (row.error ?? "").slice(0, 300), rule: row.rule ?? "", run_at: new Date().toISOString() }); }
  catch (e) { console.error("log write failed", safeMessage(e)); }
}

export interface DeliverSummary { sent: number; failed: number; skipped: number; conflicts: number; remaining: number; notConfigured: boolean }

/**
 * Sends pending emails. Safe to run concurrently and to retry:
 *  - each notification is claimed with an optimistic update (a second runner gets a conflict and skips it);
 *  - the provider call carries the notification id as an idempotency key;
 *  - a crashed run leaves "Sending", which is picked up again after 10 minutes.
 */
export async function deliverPending(opts: { limit: number; retryFailed: boolean; manual?: boolean; onlyId?: string }): Promise<DeliverSummary> {
  const sum: DeliverSummary = { sent: 0, failed: 0, skipped: 0, conflicts: 0, remaining: 0, notConfigured: false };
  const [{ rows }, { rows: smes }] = await Promise.all([readAll(N), readAll(SME)]);
  const now = Date.now();
  const eligible = rows.filter((n) => {
    if (opts.onlyId && n.notification_id !== opts.onlyId) return false;
    const s = n.email_delivery_status, tries = Number(n.email_attempts) || 0;
    return s === "Pending" || (s === "Sending" && now - Date.parse(n.updated_at) > STALE_SENDING_MS) || (opts.retryFailed && s === "Failed" && (opts.manual || tries < MAX_AUTO_ATTEMPTS)) || (!!opts.manual && s === "Skipped");
  }).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (!emailConfigured()) { sum.notConfigured = true; sum.remaining = eligible.length; return sum; } // nothing is marked or logged as sent
  const batch = eligible.slice(0, opts.limit);
  sum.remaining = eligible.length - batch.length;

  for (const n of batch) {
    const tries = (Number(n.email_attempts) || 0) + 1;
    const sme = smes.find((s) => s.sme_id === n.recipient_sme_id);
    if (!sme || sme.account_status !== "Active") {
      await updateById(N, n.notification_id, { email_delivery_status: "Skipped", delivery_error: "Recipient has not activated their account or is deactivated." }, { actor: "system" }).catch(() => undefined);
      await logAttempt({ notification_id: n.notification_id, channel: "email", attempt: tries, status: "skipped", error: "recipient not active" });
      sum.skipped++; continue;
    }
    let claimed: Row;
    try { claimed = await updateById(N, n.notification_id, { email_delivery_status: "Sending" }, { actor: "system", expectedUpdatedAt: n.updated_at }); }
    catch (e) { if (e instanceof ConflictError) { sum.conflicts++; continue; } throw e; }
    const mail = renderEmail({ subject: n.subject, message: n.message, name: sme.full_name, appUrl: appUrl() });
    const r = await sendEmail({ to: sme.email, subject: mail.subject, text: mail.text, html: mail.html, idempotencyKey: n.notification_id });
    if (r.ok) {
      await updateById(N, n.notification_id, { email_delivery_status: "Sent", email_attempts: String(tries), email_sent_at: new Date().toISOString(), delivery_error: "" }, { actor: "system" });
      await logAttempt({ notification_id: n.notification_id, channel: "email", attempt: tries, status: "sent" });
      sum.sent++;
    } else {
      // Permanent provider errors (bad address etc.) are pushed past the auto-retry limit so cron does not hammer them.
      await updateById(N, n.notification_id, { email_delivery_status: "Failed", email_attempts: String(r.transient ? tries : Math.max(tries, MAX_AUTO_ATTEMPTS)), delivery_error: r.error.slice(0, 300) }, { actor: "system" });
      await logAttempt({ notification_id: n.notification_id, channel: "email", attempt: tries, status: "failed", error: r.error });
      sum.failed++;
    }
    void claimed;
    await sleep(Number(process.env.EMAIL_SPACING_MS ?? 550)); // stay under the provider's request rate
  }
  return sum;
}

export const deliverySummaryText = (s: DeliverSummary) => s.notConfigured ? `Email is not configured, so ${s.remaining} notification(s) are waiting. Nothing was sent.` : `Emails: ${s.sent} sent, ${s.failed} failed, ${s.skipped} skipped${s.conflicts ? `, ${s.conflicts} already being handled` : ""}${s.remaining ? `; ${s.remaining} still queued` : ""}.`;

export const NOTIFICATION_TYPES = ["new_assignment", "application_deadline", "application_reminder", "missing_documents", "missing_receipt", "reimbursement_submission", "reimbursement_correction", "admit_card_collection", "exam_date_confirmation", "travel_requirements", "accommodation_requirements", "urgent_instruction"] as const;

const manualInput = z.object({
  audience: z.enum(["one", "selected", "exam", "all"]), sme_ids: z.array(z.string()).optional().default([]), exam_id: z.string().optional().default(""),
  type: z.enum(NOTIFICATION_TYPES), subject: z.string().trim().min(3, "Enter a subject").max(150), message: z.string().trim().min(3, "Enter a message").max(2000),
  batch_id: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, "Reload the page and try again."), expected_count: z.number().int().min(0).optional(), preview: z.boolean().optional().default(false),
});

async function resolveAudience(i: z.infer<typeof manualInput>): Promise<Row[]> {
  const { rows: smes } = await readAll(SME);
  if (i.audience === "one" || i.audience === "selected") {
    if (i.audience === "one" && i.sme_ids.length !== 1) throw new HttpError(400, "Choose exactly one SME.");
    if (!i.sme_ids.length) throw new HttpError(400, "Choose at least one SME.");
    const ids = new Set(i.sme_ids), found = smes.filter((s) => ids.has(s.sme_id) && s.account_status !== "Deactivated");
    if (found.length !== ids.size) throw new HttpError(400, "One or more selected SMEs do not exist or are deactivated.");
    return found;
  }
  if (i.audience === "all") return smes.filter((s) => s.account_status === "Active");
  if (!i.exam_id) throw new HttpError(400, "Choose an examination.");
  const { rows: asg } = await readAll(SHEETS.Exam_Assignments);
  const ids = new Set(asg.filter((a) => a.exam_id === i.exam_id && a.assignment_status === "Active").map((a) => a.sme_id));
  return smes.filter((s) => ids.has(s.sme_id) && s.account_status !== "Deactivated");
}

export async function sendManual(actor: Session, raw: unknown) {
  const i = manualInput.parse(raw);
  const targets = await resolveAudience(i);
  const bulk = i.audience !== "one";
  if (i.preview) return { preview: { recipients: targets.length, names: targets.slice(0, 8).map((t) => t.full_name), requiresConfirmation: bulk } };
  if (targets.length === 0) throw new HttpError(409, "No recipients match.");
  if (bulk && i.expected_count !== targets.length) throw new HttpError(409, `The recipient count changed (now ${targets.length}). Preview again to confirm.`);
  let ok = 0, failed = 0;
  for (const t of targets) {
    const done = await notifySme({ smeId: t.sme_id, examId: i.exam_id || undefined, subject: i.subject, message: i.message, type: i.type, key: `manual:${i.batch_id}:${t.sme_id}`, actor: actor.email });
    if (done) ok++; else failed++;
  }
  await audit(actor, "notification.send", "NOTIFICATION", i.batch_id, failed ? "failure" : "success", undefined, { audience: i.audience, type: i.type, recipients: targets.length, created: ok, failed });
  return { result: { recipients: targets.length, created: ok, failed } };
}

export async function sendTestEmail(actor: Session) {
  const mail = renderEmail({ subject: "Exam Application Tracker test email", message: "If you can read this, email delivery is working.", name: actor.email, appUrl: appUrl() });
  const r = await sendEmail({ to: actor.email, subject: mail.subject, text: mail.text, html: mail.html, idempotencyKey: `test:${newId("NTF")}` });
  await logAttempt({ channel: "email_test", status: r.ok ? "ok" : "failed", error: r.ok ? "" : r.error });
  await audit(actor, "email.test", "SETTINGS", "email", r.ok ? "success" : "failure", undefined, r.ok ? undefined : { error: r.error });
  return r;
}
