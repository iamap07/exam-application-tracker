// Unit tests for pure logic only (no network). Integration/E2E against real or mocked services arrive in Phase 6.
import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { SHEETS } from "@/lib/sheets/schema";
import { applyTable, parseQuery } from "@/lib/table";
import { REVIEW_TRANSITIONS } from "@/lib/constants";
import { assignInput, applicationInput, examInput, smeSelfUpdate } from "@/lib/validation";
import { daysBetween } from "@/lib/dates";
import { newId } from "@/lib/ids";

describe("csv", () => {
  it("neutralises formula injection", () => { for (const s of ["=1+1", "+cmd", "-2", "@SUM(A1)"]) expect(csvCell(s).startsWith("'")).toBe(true); });
  it("quotes commas and quotes", () => { expect(csvCell('a,"b"')).toBe('"a,""b"""'); });
  it("builds rows", () => { expect(toCsv(["a", "b"], [{ a: "1", b: "x" }])).toBe("a,b\r\n1,x"); });
});

describe("schema", () => {
  for (const def of Object.values(SHEETS)) {
    it(`${def.name} is internally consistent`, () => {
      expect(new Set(def.headers).size).toBe(def.headers.length);
      expect(def.headers).toContain(def.idColumn);
      for (const key of def.uniqueKeys ?? []) for (const k of key) expect(def.headers).toContain(k);
    });
  }
});

describe("table", () => {
  const rows = [{ n: "b", s: "x" }, { n: "a", s: "y" }, { n: "c", s: "x" }];
  it("filters, searches, sorts, pages", () => {
    const q = parseQuery({ s: "x", sort: "n", dir: "desc", pageSize: "5" }, ["s"]);
    const t = applyTable(rows, q, ["n"]);
    expect(t.rows.map((r) => r.n)).toEqual(["c", "b"]); expect(t.total).toBe(2);
  });
});

describe("review workflow", () => {
  it("requires reasons for correction and rejection", () => { expect(REVIEW_TRANSITIONS.request_correction.reasonRequired).toBe(true); expect(REVIEW_TRANSITIONS.reject.reasonRequired).toBe(true); });
  it("only allows reopening verified records through request_correction", () => {
    expect(REVIEW_TRANSITIONS.request_correction.from).toContain("Verified");
    expect(REVIEW_TRANSITIONS.verify.from).not.toContain("Verified");
    expect(REVIEW_TRANSITIONS.reject.from).not.toContain("Verified");
  });
});

describe("validation", () => {
  it("rejects admin-controlled fields in SME self-update", () => { expect(smeSelfUpdate.safeParse({ mobile: "9876543210", department: "X" }).success).toBe(false); });
  it("checks date ordering on exams", () => { expect(examInput.safeParse({ name: "Test exam", application_deadline: "2026-12-01", exam_date: "2026-11-01" }).success).toBe(false); });
  it("validates amounts", () => { expect(applicationInput.safeParse({ amount_paid: "12abc" }).success).toBe(false); expect(applicationInput.safeParse({ amount_paid: "1500.50" }).success).toBe(true); });
  it("accepts assignment modes only from the allowed set", () => { expect(assignInput.safeParse({ exam_id: "E1", mode: "everyone" }).success).toBe(false); });
});

describe("helpers", () => {
  it("daysBetween", () => { expect(daysBetween("2026-10-15", "2026-10-18")).toBe(3); });
  it("ids are unique and prefixed", () => { const s = new Set(Array.from({ length: 500 }, () => newId("SME"))); expect(s.size).toBe(500); expect([...s][0].startsWith("SME-")).toBe(true); });
});

import { HARD_MAX_BYTES, normalizeName, parseFolderId, sanitizeFileName, sniff, validateUpload } from "@/lib/files";
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 1, 2, 3, 4]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const base = { allowed: ["pdf", "jpg", "jpeg", "png"], maxBytes: HARD_MAX_BYTES };

describe("upload validation", () => {
  it("accepts a real PDF", () => { expect(validateUpload({ ...base, name: "a.pdf", declaredMime: "application/pdf", bytes: pdf }).ok).toBe(true); });
  it("rejects a PNG renamed to .pdf", () => { expect(validateUpload({ ...base, name: "a.pdf", declaredMime: "application/pdf", bytes: png }).ok).toBe(false); });
  it("rejects mismatched declared MIME", () => { expect(validateUpload({ ...base, name: "a.pdf", declaredMime: "image/png", bytes: pdf }).ok).toBe(false); });
  it("rejects disallowed extensions even with valid contents", () => { expect(validateUpload({ ...base, name: "a.exe", declaredMime: "application/pdf", bytes: pdf }).ok).toBe(false); });
  it("rejects empty and oversized files", () => {
    expect(validateUpload({ ...base, name: "a.pdf", declaredMime: "application/pdf", bytes: new Uint8Array(0) }).ok).toBe(false);
    expect(validateUpload({ ...base, maxBytes: 10, name: "a.pdf", declaredMime: "application/pdf", bytes: pdf }).ok).toBe(false);
  });
  it("sniffs signatures", () => { expect(sniff(pdf)).toBe("pdf"); expect(sniff(png)).toBe("png"); expect(sniff(new Uint8Array(20))).toBeNull(); });
});
describe("names", () => {
  it("sanitises file names and strips paths", () => { expect(sanitizeFileName("../../etc/pa ss<wd>.pdf")).toBe("pa ss_wd_.pdf"); expect(sanitizeFileName("..\\x.png")).toBe("x.png"); });
  it("normalises folder names", () => { expect(normalizeName("Ravi Kumar / M.Sc. (Phys)!")).toBe("Ravi_Kumar_M.Sc._Phys"); expect(normalizeName("???")).toBe("Unnamed"); });
  it("parses folder ids from urls", () => { expect(parseFolderId("https://drive.google.com/drive/folders/1AbC_d-9?usp=sharing")).toBe("1AbC_d-9"); expect(parseFolderId("1AbC_d-9")).toBe("1AbC_d-9"); });
});

import { admitFlags, bucketFor, parseWindows, readinessFlags } from "@/lib/readiness";
describe("readiness", () => {
  const exam = { exam_date: "2026-11-10" };
  it("buckets by the smallest window that fits", () => { const w = [30, 14, 7, 3, 1]; expect(bucketFor(0, w)).toBe(1); expect(bucketFor(2, w)).toBe(3); expect(bucketFor(8, w)).toBe(14); expect(bucketFor(31, w)).toBeNull(); expect(bucketFor(-1, w)).toBeNull(); });
  it("parses windows with a safe default", () => { expect(parseWindows("7, 30,3")).toEqual([30, 7, 3]); expect(parseWindows("abc")).toEqual([30, 14, 7, 3, 1]); });
  it("never treats an upload alone as verified", () => { expect(admitFlags({ exam, admit: { verification_status: "Pending Verification", sme_confirmed_at: "x" }, hasDoc: true, today: "2026-10-01" })).toContain("date_unverified"); });
  it("flags a missing card and a date that differs from the schedule", () => {
    const f = admitFlags({ exam, admit: { verification_status: "Pending Verification", confirmed_exam_date: "2026-11-12" }, hasDoc: false, today: "2026-10-01" });
    expect(f).toContain("admit_missing"); expect(f).toContain("date_differs");
  });
  it("flags overdue confirmation inside 7 days", () => { expect(admitFlags({ exam, hasDoc: true, today: "2026-11-05" })).toContain("confirm_overdue"); });
  it("flags unarranged travel and accommodation, and pending SME confirmation", () => {
    const admit = { verification_status: "Verified", confirmed_exam_date: "2026-11-10", travel_required: "Yes", accommodation_required: "Yes", sme_confirmed_at: "x" };
    expect(readinessFlags({ exam, admit, hasDoc: true, today: "2026-10-01" })).toEqual(expect.arrayContaining(["travel_pending", "accommodation_pending"]));
    const f = readinessFlags({ exam, admit, travel: { travel_status: "Booked", accommodation_status: "Booked", sme_confirmed: "No" }, hasDoc: true, today: "2026-10-01" });
    expect(f).toContain("sme_confirm_pending"); expect(f).not.toContain("travel_pending");
  });
});

import { escapeHtml, renderEmail } from "@/lib/email-template";
import { buildReminders, DEFAULT_REMINDER_CONFIG, fromFlat, parseReminderConfig, repeatIndex, toFlat } from "@/lib/reminders";

describe("email template", () => {
  it("escapes HTML and strips header injection", () => {
    const m = renderEmail({ subject: "Hi\r\nBcc: x@y.z", message: "<script>alert(1)</script>", name: 'A "B"', appUrl: "https://app.example" });
    expect(m.subject).not.toMatch(/[\r\n]/); expect(m.html).not.toContain("<script>"); expect(escapeHtml("<&>")).toBe("&lt;&amp;&gt;");
  });
  it("omits non-http links", () => { expect(renderEmail({ subject: "s", message: "m", name: "n", appUrl: "javascript:alert(1)" }).html).not.toContain("javascript:"); });
});

describe("reminder rules", () => {
  const base = { smes: [{ sme_id: "S1", account_status: "Active" }], exams: [{ exam_id: "E1", name: "Exam", status: "Assigned", exam_date: "2026-11-20" }], docs: [], reimb: [], admit: [], travel: [] };
  const asg = (o: object = {}) => ({ assignment_id: "A1", sme_id: "S1", exam_id: "E1", assignment_status: "Active", assignment_date: "2026-10-01", deadline: "2026-10-18", ack_status: "Pending", ...o });
  const app = (status: string) => ({ assignment_id: "A1", status, correction_note: "" });
  it("repeat schedule respects start, interval and max", () => { expect(repeatIndex(1, 2, 3, 3)).toBeNull(); expect(repeatIndex(2, 2, 3, 3)).toBe(0); expect(repeatIndex(7, 2, 3, 3)).toBe(1); expect(repeatIndex(20, 2, 3, 3)).toBeNull(); });
  it("creates the same key on repeated runs (deduplication)", () => {
    const run = () => buildReminders({ ...base, assignments: [asg()], apps: [app("In Progress")] }, DEFAULT_REMINDER_CONFIG, "2026-10-15").map((c) => c.key);
    expect(run()).toEqual(run()); expect(run().length).toBeGreaterThan(0);
  });
  it("sends a deadline reminder only on configured days", () => {
    const keys = (today: string) => buildReminders({ ...base, assignments: [asg({ ack_status: "Acknowledged" })], apps: [app("Not Started")] }, DEFAULT_REMINDER_CONFIG, today).map((c) => c.rule);
    expect(keys("2026-10-15")).toContain("deadline"); expect(keys("2026-10-17")).toContain("deadline"); expect(keys("2026-10-16")).not.toContain("deadline"); expect(keys("2026-10-12")).not.toContain("deadline");
  });
  it("skips revoked, inactive-SME and cancelled-exam assignments", () => {
    expect(buildReminders({ ...base, assignments: [asg({ assignment_status: "Revoked" })], apps: [app("Not Started")] }, DEFAULT_REMINDER_CONFIG, "2026-10-15")).toHaveLength(0);
    expect(buildReminders({ ...base, smes: [{ sme_id: "S1", account_status: "Deactivated" }], assignments: [asg()], apps: [app("Not Started")] }, DEFAULT_REMINDER_CONFIG, "2026-10-15")).toHaveLength(0);
    expect(buildReminders({ ...base, exams: [{ exam_id: "E1", name: "E", status: "Cancelled", exam_date: "" }], assignments: [asg()], apps: [app("Not Started")] }, DEFAULT_REMINDER_CONFIG, "2026-10-15")).toHaveLength(0);
  });
  it("does not nag about submitted applications or acknowledged assignments", () => {
    const rules = buildReminders({ ...base, assignments: [asg({ ack_status: "Acknowledged" })], apps: [app("Verified")] }, DEFAULT_REMINDER_CONFIG, "2026-10-15").map((c) => c.rule);
    expect(rules).not.toContain("ack"); expect(rules).not.toContain("deadline"); expect(rules).not.toContain("incomplete");
  });
  it("honours disabled rules", () => {
    const cfg = { ...DEFAULT_REMINDER_CONFIG, ack: { ...DEFAULT_REMINDER_CONFIG.ack, enabled: false } };
    const input = { ...base, assignments: [asg({ assignment_date: "2026-10-12" })], apps: [app("Verified")] };
    expect(buildReminders(input, DEFAULT_REMINDER_CONFIG, "2026-10-15").map((c) => c.rule)).toContain("ack");
    expect(buildReminders(input, cfg, "2026-10-15").map((c) => c.rule)).not.toContain("ack");
  });
  it("round-trips and validates the settings form", () => {
    expect(fromFlat(toFlat(DEFAULT_REMINDER_CONFIG))).toEqual({ ok: true, config: { ...DEFAULT_REMINDER_CONFIG, deadline: { enabled: true, days: [7, 3, 1, 0] } } });
    expect(fromFlat({ ...toFlat(DEFAULT_REMINDER_CONFIG), ack_every_days: "0" }).ok).toBe(false);
    expect(parseReminderConfig("not json")).toEqual(DEFAULT_REMINDER_CONFIG);
  });
});
