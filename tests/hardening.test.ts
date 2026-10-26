import { describe, expect, it } from "vitest";
import { createLimiter } from "@/lib/ratelimit";
import { checkIntegrity, type Snapshot } from "@/lib/integrity";
import { HttpError, readJson, route } from "@/lib/http";
import { AuthError } from "@/lib/auth/session";
import { z } from "zod";

describe("rate limiter", () => {
  it("allows up to max per window, then blocks with a retry hint, per key", () => {
    let t = 0; const l = createLimiter(3, 1000, () => t);
    expect([1, 2, 3].every(() => l.check("a").ok)).toBe(true);
    const blocked = l.check("a"); expect(blocked.ok).toBe(false); expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(l.check("b").ok).toBe(true);
    t = 1001; expect(l.check("a").ok).toBe(true);
  });
  it("forgets expired buckets so memory cannot grow forever", () => {
    let t = 0; const l = createLimiter(1, 10, () => t);
    for (let i = 0; i < 5100; i++) l.check(`k${i}`);
    t = 100; l.check("fresh"); expect(l.size()).toBeLessThan(10);
  });
});

describe("API wrapper", () => {
  const req = (body?: string, ip = "9.9.9.9") => new Request("http://x.test/api/thing", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body });
  const ctx = { params: Promise.resolve({}) };
  it("maps auth, http, validation and unexpected errors to safe responses", async () => {
    const run = async (e: unknown) => route(async () => { throw e; })(req("{}", `ip-${Math.random()}`), ctx);
    expect((await run(new AuthError(403, "Not permitted"))).status).toBe(403);
    expect((await run(new AuthError(401, "Not signed in"))).status).toBe(401);
    expect((await run(new HttpError(409, "Conflict here"))).status).toBe(409);
    const z400 = await run((() => { try { z.object({ a: z.string() }).parse({}); } catch (e) { return e; } })());
    expect(z400.status).toBe(400); expect((await z400.json()).fields).toHaveProperty("a");
    const boom = await run(new Error("secret: postgres://user:pass@host")); const body = await boom.json();
    expect(boom.status).toBe(500); expect(JSON.stringify(body)).not.toContain("postgres");
  });
  it("returns 429 with Retry-After once a client floods writes", async () => {
    const h = route(async () => new Response("ok")); const ip = `flood-${Math.random()}`; let last = 200;
    for (let i = 0; i < 125; i++) last = (await h(req("{}", ip), ctx)).status;
    expect(last).toBe(429); expect((await h(req("{}", ip), ctx)).headers.get("Retry-After")).toBeTruthy();
    expect((await h(req("{}", "someone-else"), ctx)).status).toBe(200);
  });
  it("rejects oversized and malformed JSON bodies", async () => {
    await expect(readJson(req("x".repeat(300_000)))).rejects.toMatchObject({ status: 413 });
    await expect(readJson(req("{not json"))).rejects.toMatchObject({ status: 400 });
    expect(await readJson(req('{"a":1}'))).toEqual({ a: 1 });
  });
});

describe("integrity checker", () => {
  const empty: Snapshot = { smes: [], exams: [], assignments: [], apps: [], reimb: [], admit: [], travel: [], docs: [], notifications: [] };
  const codes = (s: Partial<Snapshot>) => checkIntegrity({ ...empty, ...s }).map((i) => i.code);
  it("is silent on empty and consistent data", () => {
    expect(codes({})).toEqual([]);
    expect(codes({ smes: [{ sme_id: "S", email: "a@x", auth_user_id: "u", account_status: "Active" }], exams: [{ exam_id: "E" }], assignments: [{ assignment_id: "A", sme_id: "S", exam_id: "E", assignment_status: "Active" }], apps: [{ application_id: "P", assignment_id: "A", sme_id: "S", exam_id: "E", status: "Not Started" }] })).toEqual([]);
  });
  it("catches orphans, duplicates and cross-SME mismatches", () => {
    const c = codes({ smes: [{ sme_id: "S", email: "a@x", auth_user_id: "u", account_status: "Active" }, { sme_id: "T", email: "A@x", auth_user_id: "u", account_status: "Active" }], exams: [{ exam_id: "E" }],
      assignments: [{ assignment_id: "A", sme_id: "S", exam_id: "E", assignment_status: "Active" }, { assignment_id: "B", sme_id: "S", exam_id: "E", assignment_status: "Active" }, { assignment_id: "C", sme_id: "GONE", exam_id: "E", assignment_status: "Revoked" }],
      apps: [{ application_id: "P1", assignment_id: "NOPE", sme_id: "S", exam_id: "E" }, { application_id: "P2", assignment_id: "A", sme_id: "T", exam_id: "E" }] });
    expect(c).toEqual(expect.arrayContaining(["sme_dup_email", "sme_dup_auth", "asg_duplicate", "asg_missing_sme", "application_orphan", "application_mismatch"]));
  });
  it("catches impossible reimbursement and verification states", () => {
    const base = { assignment_id: "A", sme_id: "S", exam_id: "E" };
    const c = codes({ smes: [{ sme_id: "S", email: "a@x", auth_user_id: "u", account_status: "Active" }], exams: [{ exam_id: "E" }], assignments: [{ ...base, assignment_status: "Active" }], apps: [{ ...base, application_id: "P", status: "Verified" }],
      reimb: [{ ...base, reimbursement_id: "R", payment_status: "Paid", approval_status: "Rejected", claimed_amount: "100", approved_amount: "500" }], admit: [{ ...base, admit_id: "D", verification_status: "Verified" }] });
    expect(c).toEqual(expect.arrayContaining(["rmb_paid_no_proof", "rmb_paid_unapproved", "rmb_over_claim", "admit_incomplete", "app_verified_no_form"]));
  });
});

import { redact } from "@/lib/redact";
describe("log redaction", () => {
  it("masks credentials, tokens, keys, private keys and email addresses", () => {
    const s = redact("db postgres://user:pa55@host/x Bearer abc.def-123 key re_AbCdEf1234567890 jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4 mail a.b@corp.example.com -----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----");
    for (const leak of ["pa55", "abc.def-123", "re_AbCdEf", "eyJhbGci", "a.b@corp", "MIIE"]) expect(s).not.toContain(leak);
    expect(s).toContain("[email]");
  });
  it("truncates long messages and leaves ordinary text alone", () => { expect(redact("Provider error 503: down")).toBe("Provider error 503: down"); expect(redact("x".repeat(1000))).toHaveLength(300); });
});
