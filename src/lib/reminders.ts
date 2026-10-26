// Pure reminder rules (no I/O): given a snapshot of the data, which reminders are due today?
import { daysBetween } from "./dates";
type Row = Record<string, string>;

export interface ReminderConfig {
  ack: { enabled: boolean; after_days: number; every_days: number; max: number };
  deadline: { enabled: boolean; days: number[] };
  incomplete: { enabled: boolean; after_days: number; every_days: number; max: number };
  reimb: { enabled: boolean; after_days: number; every_days: number; max: number };
  admit: { enabled: boolean; days: number[] };
  details: { enabled: boolean; days: number[] };
  travel: { enabled: boolean; every_days: number; max: number };
}
export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  ack: { enabled: true, after_days: 2, every_days: 3, max: 3 },
  deadline: { enabled: true, days: [7, 3, 1, 0] },
  incomplete: { enabled: true, after_days: 3, every_days: 4, max: 3 },
  reimb: { enabled: true, after_days: 2, every_days: 4, max: 3 },
  admit: { enabled: true, days: [14, 7, 3, 1] },
  details: { enabled: true, days: [7, 3, 1] },
  travel: { enabled: true, every_days: 2, max: 3 },
};

const RULES = ["ack", "deadline", "incomplete", "reimb", "admit", "details", "travel"] as const;
const NUM_FIELDS: Record<string, [number, number]> = { after_days: [0, 60], every_days: [1, 60], max: [1, 10] };

export function parseReminderConfig(json: string | null | undefined): ReminderConfig {
  let raw: Record<string, Record<string, unknown>> = {};
  try { raw = JSON.parse(json ?? "{}") ?? {}; } catch { raw = {}; }
  const out = structuredClone(DEFAULT_REMINDER_CONFIG) as unknown as Record<string, Record<string, unknown>>;
  for (const r of RULES) {
    const src = raw[r]; if (!src || typeof src !== "object") continue;
    for (const k of Object.keys(out[r])) {
      const v = src[k]; if (v === undefined) continue;
      if (k === "enabled" && typeof v === "boolean") out[r][k] = v;
      else if (k === "days" && Array.isArray(v) && v.every((x) => Number.isInteger(x) && x >= 0 && x <= 60)) out[r][k] = v;
      else if (NUM_FIELDS[k] && typeof v === "number" && v >= NUM_FIELDS[k][0] && v <= NUM_FIELDS[k][1]) out[r][k] = Math.floor(v);
    }
  }
  return out as unknown as ReminderConfig;
}

export const toFlat = (c: ReminderConfig): Record<string, string> => {
  const f: Record<string, string> = {};
  for (const r of RULES) for (const [k, v] of Object.entries(c[r])) f[`${r}_${k}`] = k === "enabled" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(",") : String(v);
  return f;
};

export function fromFlat(flat: Record<string, string>): { ok: true; config: ReminderConfig } | { ok: false; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const cfg = structuredClone(DEFAULT_REMINDER_CONFIG) as unknown as Record<string, Record<string, unknown>>;
  for (const r of RULES) for (const k of Object.keys(cfg[r])) {
    const name = `${r}_${k}`, v = (flat[name] ?? "").trim();
    if (k === "enabled") { if (v !== "Yes" && v !== "No") fields[name] = "Choose Yes or No"; else cfg[r][k] = v === "Yes"; }
    else if (k === "days") { if (!/^\d{1,2}(\s*,\s*\d{1,2})*$/.test(v) || v.split(",").some((x) => Number(x) > 60)) fields[name] = "Days separated by commas, each 0 to 60"; else cfg[r][k] = [...new Set(v.split(",").map((x) => Number(x.trim())))].sort((a, b) => b - a); }
    else { const [lo, hi] = NUM_FIELDS[k]; const n = Number(v); if (!/^\d+$/.test(v) || n < lo || n > hi) fields[name] = `Whole number from ${lo} to ${hi}`; else cfg[r][k] = n; }
  }
  return Object.keys(fields).length ? { ok: false, fields } : { ok: true, config: cfg as unknown as ReminderConfig };
}

export interface Candidate { key: string; smeId: string; examId: string; rule: string; type: string; subject: string; message: string }
export interface Snapshot { smes: Row[]; exams: Row[]; assignments: Row[]; apps: Row[]; reimb: Row[]; admit: Row[]; travel: Row[]; docs: Row[] }

/** Repeat schedule: index of the current reminder window, or null if not due / exhausted. */
export function repeatIndex(age: number, after: number, every: number, max: number): number | null {
  if (age < after) return null;
  const n = Math.floor((age - after) / every);
  return n < max ? n : null;
}

const OPEN_APP = ["Not Started", "In Progress", "Correction Required"];
const APPLIED = ["Submitted", "Awaiting Verification", "Verified"];
const liveDoc = (d: Row) => !["Superseded", "Rejected"].includes(d.verification_status);

export function buildReminders(d: Snapshot, cfg: ReminderConfig, today: string): Candidate[] {
  const out: Candidate[] = [];
  const smeBy = new Map(d.smes.map((s) => [s.sme_id, s])), examBy = new Map(d.exams.map((e) => [e.exam_id, e]));
  const by = (rows: Row[]) => new Map(rows.map((r) => [r.assignment_id, r]));
  const apps = by(d.apps), admits = by(d.admit), reimbs = by(d.reimb), travels = by(d.travel);
  const docSet = (types: string[]) => new Set(d.docs.filter((x) => types.includes(x.doc_type) && liveDoc(x)).map((x) => x.assignment_id));
  const admitDocs = docSet(["admit_card"]), proofDocs = docSet(["reimbursement_proof", "payment_receipt"]);

  for (const a of d.assignments) {
    if (a.assignment_status !== "Active") continue;
    const sme = smeBy.get(a.sme_id); if (!sme || sme.account_status !== "Active") continue;
    const ex = examBy.get(a.exam_id); if (!ex || ["Cancelled", "Completed"].includes(ex.status)) continue;
    const app = apps.get(a.assignment_id), ad = admits.get(a.assignment_id), rm = reimbs.get(a.assignment_id), tv = travels.get(a.assignment_id);
    const age = a.assignment_date ? daysBetween(a.assignment_date, today) : 0;
    const left = a.deadline ? daysBetween(today, a.deadline) : null;
    const toExam = ex.exam_date ? daysBetween(today, ex.exam_date) : null;
    const add = (rule: string, bucket: string | number, subject: string, message: string) =>
      out.push({ key: `rem:${rule}:${a.assignment_id}:${bucket}`, smeId: a.sme_id, examId: a.exam_id, rule, type: `reminder_${rule}`, subject, message });
    const isApplied = !!app && APPLIED.includes(app.status);

    if (cfg.ack.enabled && a.ack_status !== "Acknowledged") {
      const n = repeatIndex(age, cfg.ack.after_days, cfg.ack.every_days, cfg.ack.max);
      if (n !== null) add("ack", n, `Please acknowledge: ${ex.name}`, `You were assigned "${ex.name}" ${age} day${age === 1 ? "" : "s"} ago and have not acknowledged it yet. Please open My Exams and acknowledge it.`);
    }
    let deadlineFired = false;
    if (cfg.deadline.enabled && app && OPEN_APP.includes(app.status) && left !== null && cfg.deadline.days.includes(left)) {
      deadlineFired = true;
      add("deadline", left, left === 0 ? `Due today: ${ex.name}` : `${left} day${left === 1 ? "" : "s"} left to apply: ${ex.name}`, `Your application for "${ex.name}" is ${app.status.toLowerCase()} and the deadline is ${a.deadline}${left === 0 ? " (today)" : ""}. ${app.status === "Correction Required" ? `Correction needed: ${app.correction_note || "see your application"}.` : "Please complete and submit it."}`);
    }
    if (cfg.incomplete.enabled && !deadlineFired && app && ["Not Started", "In Progress"].includes(app.status) && (left === null || left >= 0)) {
      const n = repeatIndex(age, cfg.incomplete.after_days, cfg.incomplete.every_days, cfg.incomplete.max);
      if (n !== null) add("incomplete", n, `Your application is not submitted: ${ex.name}`, `Your application for "${ex.name}" is still "${app.status}"${a.deadline ? ` and the deadline is ${a.deadline}` : ""}. Please finish and submit it.`);
    }
    if (cfg.reimb.enabled && rm && rm.eligible === "Yes" && rm.approval_status === "Applied — Documents Pending") {
      const since = (rm.updated_at || "").slice(0, 10) || today;
      const n = repeatIndex(daysBetween(since, today), cfg.reimb.after_days, cfg.reimb.every_days, cfg.reimb.max);
      if (n !== null) add("reimb", n, `Finish your reimbursement claim: ${ex.name}`, proofDocs.has(a.assignment_id) ? `Your reimbursement claim for "${ex.name}" is saved but not submitted. Please submit it for approval.` : `Your reimbursement claim for "${ex.name}" is missing your payment receipt or proof. Please upload it and submit the claim.`);
    }
    if (cfg.admit.enabled && isApplied && !admitDocs.has(a.assignment_id) && toExam !== null && cfg.admit.days.includes(toExam))
      add("admit", toExam, `Upload your admit card: ${ex.name}`, `Your exam "${ex.name}" is ${toExam === 0 ? "today" : `in ${toExam} day${toExam === 1 ? "" : "s"}`}. Please upload your admit card in My Admit Cards.`);
    if (cfg.details.enabled && isApplied && toExam !== null && cfg.details.days.includes(toExam) && (!ad || ["Not Submitted", "Correction Required"].includes(ad.verification_status)))
      add("details", toExam, `Confirm your exam details: ${ex.name}`, ad?.verification_status === "Correction Required" ? `Your exam details need a correction: ${ad.admin_remarks}. Please update them in My Admit Cards.` : `Please confirm your exam date, reporting time and centre for "${ex.name}" in My Admit Cards so an administrator can verify them.`);
    if (cfg.travel.enabled && tv && (tv.travel_status === "Booked" || tv.accommodation_status === "Booked") && tv.sme_confirmed !== "Yes") {
      const since = (tv.updated_at || "").slice(0, 10) || today;
      const n = repeatIndex(daysBetween(since, today), 0, cfg.travel.every_days, cfg.travel.max);
      if (n !== null) add("travel", n, `Confirm your travel arrangements: ${ex.name}`, `Travel or accommodation has been booked for "${ex.name}". Please review and confirm it in My Travel & Accommodation.`);
    }
  }
  return out;
}
