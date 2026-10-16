import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { DuplicateError, findById, insert, query, updateById, type Row } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { notifySme } from "@/lib/notifications";
import type { Session } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";
import { reimbClaimInput, reimbReviewInput } from "@/lib/validation";
import { todayIST } from "@/lib/dates";
import { anyAssignment, liveDocs, ownAssignment, requireFinancial } from "./common";

const R = SHEETS.Reimbursement_Tracker;
const SME_EDITABLE = ["Eligible — Not Applied", "Applied — Documents Pending", "Correction Required"];
const IN_REVIEW = ["Submitted for Approval", "Under Review"];

export const reimbDisplayStatus = (r: Row) => (r.payment_status === "Paid" ? "Paid" : r.payment_status === "Payment Pending" ? "Payment Pending" : r.approval_status);

export async function ensureReimbursement(asg: Row, actor: string): Promise<Row> {
  const find = async () => (await query(R, (r) => r.assignment_id === asg.assignment_id))[0];
  const existing = await find();
  if (existing) return existing;
  const exam = await findById(SHEETS.Exam_Master, asg.exam_id);
  const eligible = exam?.reimbursement_eligible === "Yes";
  try {
    return await insert(R, { reimbursement_id: newId("RMB"), assignment_id: asg.assignment_id, exam_id: asg.exam_id, sme_id: asg.sme_id, eligible: eligible ? "Yes" : "No", expected_fee: exam?.fee ?? "", claim_applied: "No", receipt_uploaded: "No", approval_status: eligible ? "Eligible — Not Applied" : "Not Eligible", payment_status: "Not Due", created_by: actor, updated_by: actor });
  } catch (e) { if (e instanceof DuplicateError) return (await find())!; throw e; }
}

export async function saveClaim(s: Session, assignmentId: string, raw: unknown) {
  const { claimed_amount, submit, expected_updated_at } = reimbClaimInput.parse(raw);
  const asg = await ownAssignment(s, assignmentId);
  const row = await ensureReimbursement(asg, s.email);
  if (row.eligible !== "Yes") throw new HttpError(409, "This exam is not eligible for reimbursement.");
  if (!SME_EDITABLE.includes(row.approval_status)) throw new HttpError(409, `This claim is "${row.approval_status}" and cannot be changed now.`);
  const [app] = await query(SHEETS.Application_Responses, (a) => a.assignment_id === assignmentId);
  const paid = Number(app?.amount_paid);
  if (!paid) throw new HttpError(400, "Enter the amount you paid in your application first.", { fields: { claimed_amount: "Your application has no amount paid yet." } });
  const claimed = Number(claimed_amount);
  if (!claimed || claimed <= 0) throw new HttpError(400, "Enter the amount you are claiming.", { fields: { claimed_amount: "Enter the amount you are claiming." } });
  if (claimed > paid) throw new HttpError(400, "You cannot claim more than you paid.", { fields: { claimed_amount: `You paid ${paid}; claim at most that.` } });
  const proof = [...(await liveDocs(assignmentId, "reimbursement_proof")), ...(await liveDocs(assignmentId, "payment_receipt"))];
  if (submit && proof.length === 0) throw new HttpError(400, "Upload your payment receipt or reimbursement proof before submitting.");
  const patch: Partial<Row> = { claimed_amount: String(claimed), amount_paid: String(paid), claim_applied: "Yes", receipt_uploaded: proof.length ? "Yes" : "No", approval_status: submit ? "Submitted for Approval" : row.approval_status === "Correction Required" ? "Correction Required" : "Applied — Documents Pending" };
  if (submit) { patch.claim_date = todayIST(); patch.admin_remarks = ""; }
  const after = await updateById(R, row.reimbursement_id, patch, { actor: s.email, expectedUpdatedAt: expected_updated_at ?? row.updated_at });
  await audit(s, submit ? "reimbursement.submit" : "reimbursement.save", "REIMBURSEMENT", after.reimbursement_id, "success", row, after);
  return after;
}

export async function reviewReimbursement(actor: Session, assignmentId: string, raw: unknown) {
  await requireFinancial(actor);
  const i = reimbReviewInput.parse(raw);
  const asg = await anyAssignment(assignmentId);
  const row = await ensureReimbursement(asg, actor.email);
  const need = (cond: boolean, msg: string) => { if (!cond) throw new HttpError(400, msg); };
  const state = (...a: string[]) => { if (!a.includes(row.approval_status)) throw new HttpError(409, `Cannot do this while the claim is "${row.approval_status}".`); };
  let patch: Partial<Row> = {}; let notice = "";
  switch (i.action) {
    case "start_review": state("Submitted for Approval"); patch = { approval_status: "Under Review" }; notice = "Your reimbursement claim is under review."; break;
    case "request_correction": state(...IN_REVIEW); need(!!i.reason.trim(), "Enter what needs correcting."); patch = { approval_status: "Correction Required", admin_remarks: i.reason.trim() }; notice = `Correction needed on your reimbursement claim: ${i.reason.trim()}`; break;
    case "approve": {
      state(...IN_REVIEW);
      const amt = Number(i.approved_amount), claimed = Number(row.claimed_amount);
      need(amt > 0, "Enter the approved amount."); need(amt <= claimed, `Approved amount cannot exceed the claimed amount (${claimed}).`);
      const partial = amt < claimed;
      need(!partial || !!i.reason.trim(), "Enter a reason for approving less than the claim.");
      // Approval never marks payment as done: payment_status moves to "Payment Pending" only.
      patch = { approval_status: partial ? "Partially Approved" : "Approved", approved_amount: String(amt), payment_status: "Payment Pending", rejection_reason: "", admin_remarks: i.reason.trim() };
      notice = `Your reimbursement was ${partial ? "partially " : ""}approved (${amt}). Payment is pending.`; break;
    }
    case "reject": state(...IN_REVIEW); need(!!i.reason.trim(), "Enter a rejection reason."); patch = { approval_status: "Rejected", rejection_reason: i.reason.trim(), payment_status: "Not Due" }; notice = `Your reimbursement claim was rejected: ${i.reason.trim()}`; break;
    case "record_payment":
      state("Approved", "Partially Approved"); need(row.payment_status === "Payment Pending", "Payment is already recorded.");
      need(!!i.payment_date, "Enter the payment date."); need(i.payment_date <= todayIST(), "Payment date cannot be in the future."); need(!!i.payment_ref.trim(), "Enter the payment reference.");
      patch = { payment_status: "Paid", payment_date: i.payment_date, payment_ref: i.payment_ref.trim() }; notice = `Your reimbursement of ${row.approved_amount} was paid (ref ${i.payment_ref.trim()}).`; break;
    case "mark_not_eligible": state("Eligible — Not Applied", "Applied — Documents Pending"); need(!!i.reason.trim(), "Enter a reason."); patch = { eligible: "No", approval_status: "Not Eligible", admin_remarks: i.reason.trim() }; notice = `Reimbursement is not available for this exam: ${i.reason.trim()}`; break;
    case "mark_eligible": state("Not Eligible"); patch = { eligible: "Yes", approval_status: "Eligible — Not Applied" }; notice = "This exam is now eligible for reimbursement."; break;
  }
  const after = await updateById(R, row.reimbursement_id, patch, { actor: actor.email, expectedUpdatedAt: row.updated_at });
  await audit(actor, `reimbursement.${i.action}`, "REIMBURSEMENT", row.reimbursement_id, "success", row, after);
  await notifySme({ smeId: row.sme_id, examId: row.exam_id, type: "reimbursement", key: `rmb:${row.reimbursement_id}:${i.action}:${after.updated_at}`, actor: actor.email, subject: "Reimbursement update", message: notice });
  return after;
}
