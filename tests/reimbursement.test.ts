import { describe, expect, it } from "vitest";
import { saveOwnApplication } from "@/lib/services/applications";
import { uploadDocument } from "@/lib/services/documents";
import { reimbDisplayStatus, reviewReimbursement, saveClaim } from "@/lib/services/reimbursements";
import { setConfig } from "@/lib/sheets/store";
import { addDays, ADMIN, assignOne, errOf, key, OPS, pdfFile, rows, seedExam, seedSme, smeSession, today } from "./helpers";

async function setup(examOver: Record<string, unknown> = {}) {
  const sme = await seedSme("S1", "Asha"); const exam = await seedExam(examOver); const asg = await assignOne(exam.exam_id, "S1");
  const S = smeSession(sme);
  await saveOwnApplication(S, asg, { amount_paid: "1000", registration_no: "R1" });
  const proof = () => uploadDocument(S, { assignmentId: asg, docType: "reimbursement_proof", uploadKey: key(), file: pdfFile("proof.pdf") });
  const row = async () => (await rows("Reimbursement_Tracker"))[0];
  const submit = async (amount = "1000") => { await proof(); return saveClaim(S, asg, { claimed_amount: amount, submit: true }); };
  const act = (a: Record<string, string>) => reviewReimbursement(ADMIN, asg, a);
  return { S, asg, row, proof, submit, act };
}

describe("claim by the SME", () => {
  it("starts as 'Eligible — Not Applied' for reimbursable exams and 'Not Eligible' otherwise", async () => {
    const a = await setup(); expect((await a.row()).approval_status).toBe("Eligible — Not Applied");
  });
  it("not-eligible exams cannot be claimed", async () => {
    const a = await setup({ reimbursement_eligible: "No" }); expect((await a.row()).approval_status).toBe("Not Eligible");
    await expect(saveClaim(a.S, a.asg, { claimed_amount: "100" })).rejects.toMatchObject({ status: 409 });
  });
  it("saves a draft, but will not submit without proof, or claim more than was paid", async () => {
    const { S, asg, row, proof } = await setup();
    await saveClaim(S, asg, { claimed_amount: "800" });
    expect(await row()).toMatchObject({ approval_status: "Applied — Documents Pending", claim_applied: "Yes", receipt_uploaded: "No", amount_paid: "1000" });
    await expect(saveClaim(S, asg, { claimed_amount: "800", submit: true })).rejects.toThrow(/Upload your payment receipt/);
    await expect(saveClaim(S, asg, { claimed_amount: "1500" })).rejects.toMatchObject({ status: 400 });
    await proof();
    await saveClaim(S, asg, { claimed_amount: "800", submit: true });
    expect(await row()).toMatchObject({ approval_status: "Submitted for Approval", claim_date: today(), receipt_uploaded: "Yes", claimed_amount: "800" });
  });
  it("needs the amount paid in the application first", async () => {
    const sme = await seedSme("S9"); const exam = await seedExam(); const asg = await assignOne(exam.exam_id, "S9");
    await expect(saveClaim(smeSession(sme), asg, { claimed_amount: "100" })).rejects.toThrow(/amount you paid/);
  });
});

describe("approval and payment are separate", () => {
  it("approval does NOT mark the claim as paid; payment is a distinct recorded step", async () => {
    const { submit, act, row } = await setup(); await submit();
    await act({ action: "start_review" });
    const approved = await act({ action: "approve", approved_amount: "1000" });
    expect(approved).toMatchObject({ approval_status: "Approved", payment_status: "Payment Pending", approved_amount: "1000" });
    expect(reimbDisplayStatus(approved)).toBe("Payment Pending");
    expect((await row()).payment_date).toBe("");
    const paid = await act({ action: "record_payment", payment_date: today(), payment_ref: "UTR123" });
    expect(paid).toMatchObject({ approval_status: "Approved", payment_status: "Paid", payment_ref: "UTR123" });
    expect(reimbDisplayStatus(paid)).toBe("Paid");
  });
  it("payment needs a date, a reference, an approved claim, and cannot be recorded twice or in the future", async () => {
    const { submit, act } = await setup(); await submit();
    await expect(act({ action: "record_payment", payment_date: today(), payment_ref: "X" })).rejects.toMatchObject({ status: 409 }); // not approved
    await act({ action: "approve", approved_amount: "1000" });
    await expect(act({ action: "record_payment", payment_ref: "X" })).rejects.toThrow(/payment date/);
    await expect(act({ action: "record_payment", payment_date: today() })).rejects.toThrow(/reference/);
    await expect(act({ action: "record_payment", payment_date: addDays(today(), 3), payment_ref: "X" })).rejects.toThrow(/future/);
    await act({ action: "record_payment", payment_date: today(), payment_ref: "X" });
    await expect(act({ action: "record_payment", payment_date: today(), payment_ref: "Y" })).rejects.toThrow();
  });
  it("partial approval needs a reason and cannot exceed the claim", async () => {
    const { submit, act } = await setup(); await submit("800");
    await expect(act({ action: "approve", approved_amount: "900" })).rejects.toThrow(/exceed/);
    await expect(act({ action: "approve", approved_amount: "500" })).rejects.toThrow(/reason/);
    expect(await act({ action: "approve", approved_amount: "500", reason: "Fee cap" })).toMatchObject({ approval_status: "Partially Approved", approved_amount: "500", payment_status: "Payment Pending" });
  });
  it("rejection and correction require reasons; the SME sees them and can resubmit after a correction", async () => {
    const { S, asg, submit, act, row } = await setup(); await submit();
    await expect(act({ action: "reject" })).rejects.toThrow(/reason/);
    await act({ action: "request_correction", reason: "Receipt unclear" });
    expect(await row()).toMatchObject({ approval_status: "Correction Required", admin_remarks: "Receipt unclear" });
    await saveClaim(S, asg, { claimed_amount: "900", submit: true });
    expect((await row()).approval_status).toBe("Submitted for Approval");
    const rej = await act({ action: "reject", reason: "Not an eligible fee" });
    expect(rej).toMatchObject({ approval_status: "Rejected", rejection_reason: "Not an eligible fee", payment_status: "Not Due" });
    await expect(act({ action: "approve", approved_amount: "100" })).rejects.toMatchObject({ status: 409 });
    expect((await rows("Notifications")).filter((n) => n.type === "reimbursement").length).toBe(2); // correction + rejection
  });
  it("an SME cannot edit a claim that is under review or approved", async () => {
    const { S, asg, submit, act } = await setup(); await submit(); await act({ action: "start_review" });
    await expect(saveClaim(S, asg, { claimed_amount: "1" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("restricted financial access", () => {
  it("Ops admins are refused until a Super Admin enables financial access", async () => {
    const { submit, asg } = await setup(); await submit();
    const e = await errOf(reviewReimbursement(OPS, asg, { action: "start_review" }));
    expect(e.status).toBe(403);
    await setConfig("ops_can_view_financial", "true", "boss");
    await expect(reviewReimbursement(OPS, asg, { action: "start_review" })).resolves.toBeTruthy();
  });
  it("audits every decision with before/after values", async () => {
    const { submit, act } = await setup(); await submit(); await act({ action: "start_review" });
    const a = (await rows("Audit_Log")).find((x) => x.action === "reimbursement.start_review")!;
    expect(JSON.parse(a.before_json).approval_status).toBe("Submitted for Approval"); expect(JSON.parse(a.after_json).approval_status).toBe("Under Review");
  });
});
void errOf;
