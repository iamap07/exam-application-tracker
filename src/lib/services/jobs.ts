import "server-only";
import { redact } from "@/lib/redact";
import { SHEETS } from "@/lib/sheets/schema";
import { ConflictError, DuplicateError, findById, getConfig, insert, readAll, updateById } from "@/lib/sheets/store";
import { loadAll } from "./dashboard";
import { deliverPending, deliverySummaryText, logAttempt } from "./notify";
import { notifySme } from "@/lib/notifications";
import { buildReminders, parseReminderConfig } from "@/lib/reminders";
import { todayIST } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { renderEmail } from "@/lib/email-template";
import { appUrl, emailConfigured } from "@/lib/env";
import { audit } from "@/lib/audit";
import { safeMessage } from "@/lib/http";

const CFG = SHEETS.System_Config;
const LOCK_MS = 10 * 60 * 1000;
export const MAX_NEW_REMINDERS_PER_RUN = 25; // Sheets write quota; the rest are picked up by the next run (deduplicated by key)
export type JobName = "reminders" | "deliver";
export type Trigger = "cron" | "manual";

async function withLock<T>(name: string, fn: () => Promise<T>): Promise<{ busy: true } | { busy: false; result: T }> {
  const key = `lock:${name}`, now = Date.now();
  try {
    const row = await findById(CFG, key);
    if (row) {
      if (row.value && now - Date.parse(row.value) < LOCK_MS) return { busy: true };
      await updateById(CFG, key, { value: new Date(now).toISOString() }, { expectedUpdatedAt: row.updated_at, actor: "system" });
    } else await insert(CFG, { key, value: new Date(now).toISOString(), updated_by: "system" });
  } catch (e) { if (e instanceof ConflictError || e instanceof DuplicateError) return { busy: true }; throw e; }
  try { return { busy: false, result: await fn() }; }
  finally { await updateById(CFG, key, { value: "" }, { actor: "system" }).catch(() => undefined); }
}

async function alertAdmins(subject: string, message: string) {
  if (!emailConfigured()) return;
  const to = (process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const addr of to) {
    const m = renderEmail({ subject, message, name: "administrator", appUrl: `${appUrl()}/admin/notifications` });
    const r = await sendEmail({ to: addr, subject: m.subject, text: m.text, html: m.html, idempotencyKey: `alert:${Date.now()}:${addr}` });
    if (!r.ok) console.error("failure alert could not be sent", redact(r.error));
  }
}

async function runReminders() {
  const b = await loadAll();
  const cfg = parseReminderConfig(await getConfig("reminder_config"));
  const due = buildReminders({ smes: b.smes, exams: b.exams, assignments: b.assignments, apps: b.apps, reimb: b.reimb, admit: b.admit, travel: b.travel, docs: b.docs }, cfg, todayIST());
  const seen = new Set(b.notifications.map((n) => n.idempotency_key)); // deduplication: a key is only ever created once
  const fresh = due.filter((c) => !seen.has(c.key));
  const batch = fresh.slice(0, MAX_NEW_REMINDERS_PER_RUN);
  let created = 0, failed = 0;
  for (const c of batch) { (await notifySme({ smeId: c.smeId, examId: c.examId, subject: c.subject, message: c.message, type: c.type, key: c.key, actor: "system" })) ? created++ : failed++; }
  const d = await deliverPending({ limit: 15, retryFailed: true });
  return { due: due.length, created, failed, deferred: fresh.length - batch.length, deliver: d, text: `Reminders: ${created} created${failed ? `, ${failed} failed to create` : ""}${fresh.length > batch.length ? `, ${fresh.length - batch.length} deferred to the next run` : ""}. ${deliverySummaryText(d)}`, problems: failed + d.failed };
}
async function runDeliver() {
  const d = await deliverPending({ limit: 15, retryFailed: true });
  return { deliver: d, text: deliverySummaryText(d), problems: d.failed };
}

/** Runs a job under a lock, records the run (success or failure) and alerts admins on problems. Never throws for job failures. */
export async function runJob(name: JobName, trigger: Trigger): Promise<{ ok: boolean; busy?: boolean; message: string }> {
  const channel = `job:${trigger}`;
  try {
    const r = await withLock(name, name === "reminders" ? runReminders : runDeliver);
    if (r.busy) { await logAttempt({ channel, rule: name, status: "busy", error: "Another run is in progress" }); return { ok: false, busy: true, message: "Another run is already in progress. Try again in a few minutes." }; }
    const res = r.result;
    await logAttempt({ channel, rule: name, status: res.problems ? "partial" : "ok", error: res.text });
    await audit({ userId: "system", role: "system", email: "system" }, `job.${name}`, "JOB", trigger, res.problems ? "failure" : "success", undefined, { summary: res.text });
    if (res.problems) await alertAdmins(`Exam Tracker: ${name} job had ${res.problems} problem(s)`, `${res.text}\n\nOpen the notification centre to retry failed emails.`);
    return { ok: !res.problems, message: res.text };
  } catch (e) {
    const msg = safeMessage(e).slice(0, 200);
    await logAttempt({ channel, rule: name, status: "failed", error: msg });
    await alertAdmins(`Exam Tracker: ${name} job failed`, `The ${name} job (${trigger}) failed: ${msg}\n\nCheck Settings > Integration health, then run it again from the notification centre.`);
    return { ok: false, message: `The ${name} job failed: ${msg}` };
  }
}

/** Honest status: "scheduler verified" only if a cron-triggered run succeeded recently. */
export async function integrationStatus() {
  const { rows } = await readAll(SHEETS.Notification_Log);
  // newest first; rows written in the same millisecond keep append order (later row wins)
  const ordered = rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.run_at.localeCompare(a.r.run_at) || b.i - a.i).map((x) => x.r);
  const latest = (f: (r: Record<string, string>) => boolean) => ordered.find(f);
  const cron = latest((r) => r.channel === "job:cron" && ["ok", "partial"].includes(r.status));
  const test = latest((r) => r.channel === "email_test");
  const fresh = cron && Date.now() - Date.parse(cron.run_at) < 36 * 3600 * 1000;
  return {
    emailConfigured: emailConfigured(),
    emailTest: test ? { ok: test.status === "ok", at: test.run_at, error: test.error } : null,
    scheduler: { verified: !!fresh, lastCronAt: cron?.run_at ?? null },
    runs: ordered.filter((r) => r.channel.startsWith("job:")).slice(0, 10),
  };
}
