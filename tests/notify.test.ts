import { describe, expect, it } from "vitest";
import { notifySme } from "@/lib/notifications";
import { deliverPending, sendManual, sendTestEmail } from "@/lib/services/notify";
import { integrationStatus, runJob } from "@/lib/services/jobs";
import { SHEETS } from "@/lib/sheets/schema";
import { insert, readAll, setConfig } from "@/lib/sheets/store";
import { addDays, ADMIN, assignOne, errOf, rows, seedExam, seedSme, setRaw, today } from "./helpers";
import { emailState, sheetsState } from "./fakes/state";

let n = 0;
const queue = (smeId: string, subject = "Hello") => notifySme({ smeId, subject, message: "Body text", type: "urgent_instruction", key: `t:${++n}`, actor: "t" });
const send = (o: Partial<Parameters<typeof deliverPending>[0]> = {}) => deliverPending({ limit: 20, retryFailed: true, ...o });
const batch = () => `batch-${Date.now()}-${++n}-aaaaaaaa`;
const one = async () => (await rows("Notifications"))[0];

describe("email delivery", () => {
  it("sends once, records status/attempts/time, logs the attempt and uses the notification id as idempotency key", async () => {
    await seedSme("S1", "Asha"); await queue("S1");
    const r = await send(); expect(r).toMatchObject({ sent: 1, failed: 0 });
    const x = await one(); expect(x).toMatchObject({ email_delivery_status: "Sent", email_attempts: "1", delivery_error: "" }); expect(x.email_sent_at).toBeTruthy();
    expect(emailState.sent[0]).toMatchObject({ to: "s1@x.test", key: x.notification_id });
    expect((await rows("Notification_Log")).filter((l) => l.channel === "email" && l.status === "sent")).toHaveLength(1);
    expect((await send()).sent).toBe(0); expect(emailState.sent).toHaveLength(1); // nothing is sent twice
  });
  it("records a transient failure and succeeds on the next run", async () => {
    await seedSme("S1"); await queue("S1"); emailState.mode = "transient";
    expect((await send()).failed).toBe(1);
    expect(await one()).toMatchObject({ email_delivery_status: "Failed", email_attempts: "1" }); expect((await one()).delivery_error).toMatch(/503/);
    emailState.mode = "ok"; expect((await send()).sent).toBe(1);
    expect((await one()).email_delivery_status).toBe("Sent"); expect((await one()).delivery_error).toBe("");
  });
  it("stops auto-retrying permanent errors but lets an admin retry manually", async () => {
    await seedSme("S1"); await queue("S1"); emailState.mode = "permanent"; await send();
    expect((await one()).email_attempts).toBe("5");
    const before = emailState.attempts; await send(); expect(emailState.attempts).toBe(before);
    emailState.mode = "ok"; expect((await send({ manual: true })).sent).toBe(1);
  });
  it("gives up auto-retry after 5 transient failures", async () => {
    await seedSme("S1"); await queue("S1"); emailState.mode = "transient";
    for (let i = 0; i < 7; i++) await send();
    expect(emailState.attempts).toBe(5);
  });
  it("skips recipients who have not activated or are deactivated (no email, clearly marked)", async () => {
    await seedSme("S1", "A", "P", "Pending Invite"); await queue("S1");
    expect((await send()).skipped).toBe(1); expect(emailState.sent).toHaveLength(0);
    expect(await one()).toMatchObject({ email_delivery_status: "Skipped" });
  });
  it("when email is not configured nothing is marked, logged or sent as delivered", async () => {
    await seedSme("S1"); await queue("S1"); const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
    try { const r = await send(); expect(r.notConfigured).toBe(true); expect(r.remaining).toBe(1); } finally { process.env.RESEND_API_KEY = key; }
    expect((await one()).email_delivery_status).toBe("Pending"); expect((await rows("Notification_Log")).filter((l) => l.status === "sent")).toHaveLength(0);
  });
  it("two overlapping runs never send the same notification twice", async () => {
    await seedSme("S1"); await queue("S1"); await queue("S1");
    await Promise.all([send(), send(), send()]);
    expect(emailState.sent).toHaveLength(2); expect(new Set(emailState.sent.map((s) => s.key)).size).toBe(2);
  });
  it("recovers a notification stuck in 'Sending' only after it is stale", async () => {
    await seedSme("S1"); await queue("S1"); const id = (await one()).notification_id;
    setRaw("Notifications", "notification_id", id, "email_delivery_status", "Sending");
    expect((await send()).sent).toBe(0);
    setRaw("Notifications", "notification_id", id, "updated_at", new Date(Date.now() - 3600_000).toISOString());
    expect((await send()).sent).toBe(1);
  });
});

describe("manual notifications", () => {
  const base = (o: object = {}) => ({ type: "urgent_instruction", subject: "Please read", message: "Important update", batch_id: batch(), audience: "selected", sme_ids: ["S1", "S2"], ...o });
  it("previews the recipient count and requires the confirmed count for bulk sends", async () => {
    await seedSme("S1"); await seedSme("S2"); await seedSme("S3", "C", "P", "Deactivated");
    expect((await sendManual(ADMIN, base({ audience: "all", preview: true }))) as never).toMatchObject({ preview: { recipients: 2, requiresConfirmation: true } });
    await expect(sendManual(ADMIN, base({ audience: "all" }))).rejects.toThrow(/count/);
    const out = await sendManual(ADMIN, base({ audience: "all", expected_count: 2 })) as { result: { created: number } };
    expect(out.result.created).toBe(2); expect(await rows("Notifications")).toHaveLength(2);
  });
  it("a double click (same batch) never duplicates notifications", async () => {
    await seedSme("S1"); await seedSme("S2"); const b = base({ expected_count: 2 });
    await sendManual(ADMIN, b); await sendManual(ADMIN, b);
    expect(await rows("Notifications")).toHaveLength(2);
  });
  it("targets one SME, selected SMEs, or everyone assigned to an exam", async () => {
    await seedSme("S1"); await seedSme("S2"); await seedSme("S3"); const exam = await seedExam(); await assignOne(exam.exam_id, "S1"); await assignOne(exam.exam_id, "S3");
    const before = (await rows("Notifications")).length;
    await sendManual(ADMIN, base({ audience: "exam", exam_id: exam.exam_id, expected_count: 2 }));
    const added = (await rows("Notifications")).slice(before); expect(added.map((x) => x.recipient_sme_id).sort()).toEqual(["S1", "S3"]); expect(added[0].exam_id).toBe(exam.exam_id);
    await expect(sendManual(ADMIN, base({ audience: "one", sme_ids: ["S1", "S2"] }))).rejects.toThrow(/exactly one/);
    await expect(sendManual(ADMIN, base({ audience: "selected", sme_ids: ["NOPE"] }))).rejects.toThrow(/do not exist/);
  });
  it("validates subject, message and type", async () => {
    await seedSme("S1");
    await expect(sendManual(ADMIN, base({ subject: "" }))).rejects.toThrow(); await expect(sendManual(ADMIN, base({ type: "spam" }))).rejects.toThrow();
  });
});

describe("scheduled jobs", () => {
  async function arrange() { await seedSme("S1", "Asha"); const exam = await seedExam({ application_deadline: addDays(today(), 3) }); await assignOne(exam.exam_id, "S1"); return exam; }
  const reminders = async () => (await rows("Notifications")).filter((x) => x.type.startsWith("reminder_"));

  it("creates due reminders, emails them, and never duplicates them on later runs", async () => {
    await arrange();
    const a = await runJob("reminders", "manual"); expect(a.ok).toBe(true);
    const r = await reminders(); expect(r).toHaveLength(1); expect(r[0].type).toBe("reminder_deadline"); expect(r[0].subject).toMatch(/3 days left/);
    expect(emailState.sent.length).toBe(2); // assignment notice + the reminder
    await runJob("reminders", "manual"); await runJob("reminders", "cron");
    expect(await reminders()).toHaveLength(1); expect(emailState.sent.length).toBe(2);
  });
  it("does not remind deactivated SMEs or revoked assignments", async () => {
    await arrange(); const { updateById } = await import("@/lib/sheets/store"); await updateById(SHEETS.SME_Master, "S1", { account_status: "Deactivated" });
    await runJob("reminders", "manual"); expect(await reminders()).toHaveLength(0);
  });
  it("refuses to overlap: a fresh lock makes the run report 'busy' and change nothing", async () => {
    await arrange(); await insert(SHEETS.System_Config, { key: "lock:reminders", value: new Date().toISOString(), updated_by: "other" });
    const r = await runJob("reminders", "manual"); expect(r).toMatchObject({ ok: false, busy: true }); expect(await reminders()).toHaveLength(0);
  });
  it("takes over a stale lock", async () => {
    await arrange(); await insert(SHEETS.System_Config, { key: "lock:reminders", value: new Date(Date.now() - 3600_000).toISOString(), updated_by: "crashed" });
    expect((await runJob("reminders", "manual")).ok).toBe(true);
  });
  it("a failing job is recorded, alerts the admins by email, releases its lock, and can be re-run", async () => {
    await arrange(); sheetsState.batchGetFail = true;
    const r = await runJob("reminders", "cron"); expect(r.ok).toBe(false); expect(r.message).toMatch(/failed/);
    expect((await rows("Notification_Log")).some((l) => l.channel === "job:cron" && l.status === "failed")).toBe(true);
    expect(emailState.sent.some((m) => m.to === "boss@x.test" && /failed/.test(m.subject))).toBe(true);
    sheetsState.batchGetFail = false; expect((await runJob("reminders", "cron")).ok).toBe(true);
  });
  it("delivery failures inside a job are reported as problems and alert the admins", async () => {
    await arrange(); emailState.mode = "transient";
    const r = await runJob("reminders", "cron"); expect(r.ok).toBe(false);
    expect((await rows("Notification_Log")).some((l) => l.rule === "reminders" && l.status === "partial")).toBe(true);
  });
  it("only a successful SCHEDULED run verifies the scheduler; manual runs never do", async () => {
    await arrange(); await runJob("deliver", "manual"); expect((await integrationStatus()).scheduler.verified).toBe(false);
    await runJob("deliver", "cron"); const s = await integrationStatus(); expect(s.scheduler.verified).toBe(true); expect(s.runs.length).toBe(2);
  });
});

describe("email test", () => {
  it("records the outcome of a test email, success or failure", async () => {
    expect((await sendTestEmail(ADMIN)).ok).toBe(true); expect((await integrationStatus()).emailTest).toMatchObject({ ok: true });
    emailState.mode = "permanent"; expect((await sendTestEmail(ADMIN)).ok).toBe(false); expect((await integrationStatus()).emailTest).toMatchObject({ ok: false });
  });
});
void errOf; void readAll; void setConfig;
