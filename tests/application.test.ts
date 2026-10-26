import { describe, expect, it } from "vitest";
import { getOwnApplication, reviewApplication, saveOwnApplication } from "@/lib/services/applications";
import { uploadDocument } from "@/lib/services/documents";
import { ConflictError } from "@/lib/sheets/store";
import { ADMIN, assignOne, errOf, key, pdfFile, rows, seedExam, seedSme, smeSession } from "./helpers";

const FULL = { registration_no: "R-100", applied_post: "Lecturer", centre_city: "Delhi", amount_paid: "1000", payment_mode: "UPI" };
async function setup() {
  const sme = await seedSme("S1", "Asha"); const exam = await seedExam(); const asg = await assignOne(exam.exam_id, "S1");
  const S = smeSession(sme); const app = async () => (await getOwnApplication(S, asg)).application;
  const docs = async () => { await uploadDocument(S, { assignmentId: asg, docType: "application_form", uploadKey: key(), file: pdfFile() }); await uploadDocument(S, { assignmentId: asg, docType: "payment_receipt", uploadKey: key(), file: pdfFile("r.pdf") }); };
  return { S, asg, app, docs, appId: async () => (await app()).application_id };
}

describe("SME application form", () => {
  it("saves a draft and resumes it", async () => {
    const { S, asg, app } = await setup();
    expect((await app()).status).toBe("Not Started");
    await saveOwnApplication(S, asg, { registration_no: "R-1" });
    const a = await app(); expect(a.status).toBe("In Progress"); expect(a.registration_no).toBe("R-1");
  });
  it("validates field formats", async () => {
    const { S, asg } = await setup();
    await expect(saveOwnApplication(S, asg, { amount_paid: "12abc" })).rejects.toThrow();
    await expect(saveOwnApplication(S, asg, { payment_mode: "Barter" })).rejects.toThrow();
  });
  it("refuses to submit with missing required fields and says which", async () => {
    const { S, asg, app } = await setup();
    const e = await errOf(saveOwnApplication(S, asg, { registration_no: "R-1", submit: true }));
    expect(e.status).toBe(400); expect(Object.keys(e.extra.fields)).toEqual(expect.arrayContaining(["applied_post", "centre_city", "amount_paid", "payment_mode"]));
    expect((await app()).status).toBe("Not Started"); // a refused submit saves nothing
  });
  it("a partial update never erases fields it does not mention", async () => {
    const { S, asg, app } = await setup();
    await saveOwnApplication(S, asg, { registration_no: "R-1", applied_post: "Lecturer", amount_paid: "500" });
    await saveOwnApplication(S, asg, { remarks: "only this" });
    const a = await app(); expect(a).toMatchObject({ registration_no: "R-1", applied_post: "Lecturer", amount_paid: "500", remarks: "only this" });
  });
  it("submits, stamps the date and mirrors the status on the assignment", async () => {
    const { S, asg, app } = await setup();
    await saveOwnApplication(S, asg, { ...FULL, submit: true });
    const a = await app(); expect(a.status).toBe("Submitted"); expect(a.submitted_at).toBeTruthy();
    expect((await rows("Exam_Assignments"))[0].application_status).toBe("Submitted");
  });
  it("rejects a stale edit (two tabs open) instead of overwriting", async () => {
    const { S, asg, app } = await setup();
    const stale = (await app()).updated_at;
    await new Promise((r) => setTimeout(r, 5));
    await saveOwnApplication(S, asg, { remarks: "first" });
    await expect(saveOwnApplication(S, asg, { remarks: "second", expected_updated_at: stale })).rejects.toBeInstanceOf(ConflictError);
    expect((await app()).remarks).toBe("first");
  });
});

describe("admin review", () => {
  it("cannot verify until the application form and receipt are uploaded", async () => {
    const { S, asg, docs, appId } = await setup();
    await saveOwnApplication(S, asg, { ...FULL, submit: true });
    const e = await errOf(reviewApplication(ADMIN, await appId(), "verify", ""));
    expect(e.status).toBe(409); expect(e.message).toMatch(/Application form/); expect(e.message).toMatch(/Payment receipt/);
    await docs();
    expect((await reviewApplication(ADMIN, await appId(), "verify", "")).status).toBe("Verified");
  });
  it("requires a reason for correction and rejection, and rejects impossible transitions", async () => {
    const { S, asg, appId } = await setup();
    await expect(reviewApplication(ADMIN, await appId(), "verify", "")).rejects.toMatchObject({ status: 409 }); // not submitted yet
    await saveOwnApplication(S, asg, { ...FULL, submit: true });
    await expect(reviewApplication(ADMIN, await appId(), "request_correction", " ")).rejects.toMatchObject({ status: 400 });
    await expect(reviewApplication(ADMIN, await appId(), "reject", "")).rejects.toMatchObject({ status: 400 });
  });
  it("locks verified applications; reopening needs the explicit correction workflow with a reason", async () => {
    const { S, asg, docs, appId, app } = await setup();
    await saveOwnApplication(S, asg, { ...FULL, submit: true }); await docs();
    await reviewApplication(ADMIN, await appId(), "verify", "");
    await expect(saveOwnApplication(S, asg, { remarks: "sneaky" })).rejects.toThrow(/verified/i);
    await reviewApplication(ADMIN, await appId(), "request_correction", "Wrong post");
    expect((await app()).status).toBe("Correction Required"); expect((await app()).correction_note).toBe("Wrong post");
    await saveOwnApplication(S, asg, { applied_post: "Professor", submit: true });
    const a = await app(); expect(a.status).toBe("Submitted"); expect(a.correction_note).toBe("");
  });
  it("tells the SME about each decision in-app", async () => {
    const { S, asg, appId } = await setup();
    await saveOwnApplication(S, asg, { ...FULL, submit: true });
    await reviewApplication(ADMIN, await appId(), "request_correction", "Fix the city");
    const n = (await rows("Notifications")).filter((x) => x.type === "verification_result");
    expect(n).toHaveLength(1); expect(n[0].message).toContain("Fix the city"); expect(n[0].recipient_sme_id).toBe("S1");
  });
});
