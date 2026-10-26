// Integration: REAL store.ts against an in-memory fake of the Sheets API.
import { describe, expect, it } from "vitest";
import { SHEETS } from "@/lib/sheets/schema";
import { ConflictError, DuplicateError, ensureSchema, findById, insert, readAll, updateById } from "@/lib/sheets/store";
import { sheetsState } from "./fakes/state";

const SME = SHEETS.SME_Master;
const base = (id: string, email: string) => ({ sme_id: id, full_name: "A", email, department: "X", account_status: "Active" });

describe("schema initialisation", () => {
  it("creates every tab with headers and is idempotent", async () => {
    expect(sheetsState.tabs.size).toBe(13);
    const again = await ensureSchema();
    expect(again.every((r) => r.status === "ok")).toBe(true);
  });
  it("reports a header mismatch and never overwrites it", async () => {
    sheetsState.tabs.get("SME_Master")![0] = ["wrong", "headers"];
    const r = await ensureSchema();
    expect(r.find((x) => x.sheet === "SME_Master")!.status).toBe("mismatch");
    expect(sheetsState.tabs.get("SME_Master")![0]).toEqual(["wrong", "headers"]);
    await expect(readAll(SME)).rejects.toThrow(/Header mismatch/);
  });
});

describe("writes", () => {
  it("rejects duplicate unique keys case-insensitively", async () => {
    await insert(SME, base("S1", "A@x.test"));
    await expect(insert(SME, base("S2", "a@X.test"))).rejects.toBeInstanceOf(DuplicateError);
  });
  it("rejects a duplicate id", async () => {
    await insert(SME, base("S1", "a@x.test"));
    await expect(insert(SME, base("S1", "b@x.test"))).rejects.toBeInstanceOf(DuplicateError);
  });
  it("serialises concurrent inserts of the same unique key: exactly one wins", async () => {
    const res = await Promise.allSettled([insert(SME, base("S1", "same@x.test")), insert(SME, base("S2", "same@x.test"))]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await readAll(SME)).rows).toHaveLength(1);
  });
  it("neutralises formula injection when writing", async () => {
    await insert(SME, { ...base("S1", "a@x.test"), full_name: "=HYPERLINK(\"http://evil\")" });
    expect(sheetsState.tabs.get("SME_Master")![1].includes("'=HYPERLINK(\"http://evil\")")).toBe(true);
  });
  it("never reports success for a write that is not visible (read-back check)", async () => {
    sheetsState.dropAppends = true;
    await expect(insert(SME, base("S1", "a@x.test"))).rejects.toThrow(/could not be verified/);
  });
  it("propagates a failed write instead of swallowing it", async () => {
    sheetsState.failAppend = { tab: "SME_Master", times: 1 };
    await expect(insert(SME, base("S1", "a@x.test"))).rejects.toThrow();
    expect((await readAll(SME)).rows).toHaveLength(0);
  });
});

describe("updates", () => {
  it("rejects a stale write and leaves data unchanged (optimistic concurrency)", async () => {
    const row = await insert(SME, base("S1", "a@x.test"));
    await new Promise((r) => setTimeout(r, 5));
    await updateById(SME, "S1", { department: "Y" });
    await expect(updateById(SME, "S1", { department: "Z" }, { expectedUpdatedAt: row.updated_at })).rejects.toBeInstanceOf(ConflictError);
    expect((await findById(SME, "S1"))!.department).toBe("Y");
  });
  it("treats undefined patch values as 'leave unchanged'", async () => {
    await insert(SME, base("S1", "a@x.test"));
    await updateById(SME, "S1", { department: undefined, designation: "Dr" });
    const r = (await findById(SME, "S1"))!;
    expect(r.department).toBe("X"); expect(r.designation).toBe("Dr");
  });
  it("finds records by stable id even after rows are inserted before them", async () => {
    await insert(SME, base("S1", "a@x.test")); await insert(SME, base("S2", "b@x.test"));
    await updateById(SME, "S2", { department: "Chem" });
    expect((await findById(SME, "S1"))!.department).toBe("X"); expect((await findById(SME, "S2"))!.department).toBe("Chem");
  });
});

describe("resilience", () => {
  it("retries transient Google errors with backoff", async () => {
    sheetsState.failNext = { status: 503, times: 1 };
    await expect(insert(SME, base("S1", "a@x.test"))).resolves.toBeTruthy();
  });
  it("does not retry permanent errors", async () => {
    sheetsState.failNext = { status: 403, times: 1 };
    await expect(readAll(SME)).rejects.toThrow();
  });
});

describe("row versions", () => {
  it("every update yields a strictly newer updated_at, even within the same millisecond", async () => {
    await insert(SME, base("S1", "a@x.test"));
    const RealDate = Date, fixed = RealDate.now();
    // freeze "now" for `new Date()` only, so same-millisecond writes are guaranteed
    class FrozenDate extends RealDate { constructor(...a: unknown[]) { if (a.length === 0) super(fixed); else super(...(a as [number])); } static now() { return fixed; } }
    (globalThis as { Date: unknown }).Date = FrozenDate;
    try {
      const a = await updateById(SME, "S1", { department: "A" }); const b = await updateById(SME, "S1", { department: "B" });
      expect(b.updated_at > a.updated_at).toBe(true);
      await expect(updateById(SME, "S1", { department: "C" }, { expectedUpdatedAt: a.updated_at })).rejects.toBeInstanceOf(ConflictError);
    } finally { (globalThis as { Date: unknown }).Date = RealDate; }
  });
});
