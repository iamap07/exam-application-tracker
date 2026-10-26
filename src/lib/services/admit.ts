import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { DuplicateError, findById, insert, query, updateById, type Row } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { notifySme } from "@/lib/notifications";
import type { Session } from "@/lib/auth/session";
import { HttpError, safeMessage } from "@/lib/http";
import { admitInput, admitReviewInput } from "@/lib/validation";
import { admitFlags, FLAG_LABELS } from "@/lib/readiness";
import { todayIST } from "@/lib/dates";
import { anyAssignment, liveDocs, ownAssignment } from "./common";
import { ensureTravelFromAdmit } from "./travel";

const AD = SHEETS.Admit_Card_Tracker;

export async function ensureAdmit(asg: Row, actor: string): Promise<Row> {
  const find = async () => (await query(AD, (r) => r.assignment_id === asg.assignment_id))[0];
  const ex = await find(); if (ex) return ex;
  try { return await insert(AD, { admit_id: newId("ADM"), assignment_id: asg.assignment_id, exam_id: asg.exam_id, sme_id: asg.sme_id, admit_card_uploaded: "No", verification_status: "Not Submitted", created_by: actor, updated_by: actor }); }
  catch (e) { if (e instanceof DuplicateError) return (await find())!; throw e; }
}

/** Called after an admit-card document is uploaded or replaced. Uploading never verifies anything; a new card sends a verified record back for re-checking. */
export async function syncAdmitDocument(asg: Row, actor: string) {
  const row = await ensureAdmit(asg, actor);
  const doc = (await liveDocs(asg.assignment_id, "admit_card"))[0];
  const patch: Partial<Row> = { admit_card_uploaded: doc ? "Yes" : "No", admit_card_document_id: doc?.document_id ?? "" };
  if (row.verification_status === "Verified") { patch.verification_status = "Pending Verification"; patch.admin_remarks = "A new admit card was uploaded; please re-verify."; }
  await updateById(AD, row.admit_id, patch, { actor });
}

export async function saveAdmitDetails(s: Session, assignmentId: string, raw: unknown) {
  const { submit, expected_updated_at, ...data } = admitInput.parse(raw);
  const asg = await ownAssignment(s, assignmentId);
  const row = await ensureAdmit(asg, s.email);
  if (row.verification_status === "Verified") throw new HttpError(409, "These details are verified. Ask an administrator to reopen them for changes.");
  const doc = (await liveDocs(assignmentId, "admit_card"))[0];
  const merged = { ...row, ...data } as Record<string, string>;
  if (submit) {
    const labels: Record<string, string> = { confirmed_exam_date: "Enter the exam date on your admit card", reporting_time: "Enter the reporting time", centre_name: "Enter the exam centre name", centre_address: "Enter the exam centre address", city: "Enter the exam city", travel_required: "Choose Yes or No", accommodation_required: "Choose Yes or No" };
    const fields = Object.fromEntries(Object.entries(labels).filter(([k]) => !merged[k]));
    if (Object.keys(fields).length) throw new HttpError(400, "Complete the required fields before sending.", { fields });
    if (!doc) throw new HttpError(400, "Upload your admit card first so it can be compared with these details.");
  }
  const patch: Partial<Row> = { ...(data as Record<string, string>), admit_card_uploaded: doc ? "Yes" : "No", admit_card_document_id: doc?.document_id ?? "" };
  if (submit) { patch.sme_confirmed_at = new Date().toISOString(); patch.verification_status = "Pending Verification"; patch.admin_remarks = ""; }
  const after = await updateById(AD, row.admit_id, patch, { actor: s.email, expectedUpdatedAt: expected_updated_at ?? row.updated_at });
  await audit(s, submit ? "admit.submit" : "admit.save", "ADMIT", after.admit_id, "success", row, after);
  return after;
}

export async function reviewAdmit(actor: Session, assignmentId: string, raw: unknown) {
  const i = admitReviewInput.parse(raw);
  const asg = await anyAssignment(assignmentId);
  const row = await ensureAdmit(asg, actor.email);
  const exam = await findById(SHEETS.Exam_Master, asg.exam_id);
  let warning: string | undefined;
  if (i.action === "request_correction") {
    if (!["Pending Verification", "Verified"].includes(row.verification_status)) throw new HttpError(409, `Nothing to correct while the record is "${row.verification_status}".`);
    if (!i.reason.trim()) throw new HttpError(400, "Enter what needs correcting. The SME will see it.");
    const after = await updateById(AD, row.admit_id, { verification_status: "Correction Required", admin_remarks: i.reason.trim(), verified_by: "", verified_at: "" }, { actor: actor.email, expectedUpdatedAt: row.updated_at });
    await audit(actor, "admit.request_correction", "ADMIT", row.admit_id, "success", row, after);
    await notifySme({ smeId: row.sme_id, examId: row.exam_id, type: "admit_review", key: `admit:${row.admit_id}:correction:${after.updated_at}`, actor: actor.email, subject: "Correction needed on your admit card details", message: i.reason.trim().slice(0, 300) });
    return { admit: after, warning };
  }
  if (row.verification_status !== "Pending Verification") throw new HttpError(409, `Only records that are "Pending Verification" can be verified (this one is "${row.verification_status}").`);
  const doc = (await liveDocs(assignmentId, "admit_card"))[0];
  if (!doc) throw new HttpError(409, "There is no admit card document to compare against.");
  const flags = admitFlags({ exam: exam ?? {}, admit: row, hasDoc: true, today: todayIST() });
  if (flags.includes("details_incomplete")) throw new HttpError(409, "Some centre details are missing. Request a correction.");
  if (flags.includes("date_differs") && !i.accept_date_difference) throw new HttpError(409, `The confirmed date (${row.confirmed_exam_date}) differs from the exam schedule (${exam?.exam_date}). Confirm that the admit card shows the new date, or request a correction.`, { flags: flags.map((f) => FLAG_LABELS[f]), needsDateConfirmation: true });
  const after = await updateById(AD, row.admit_id, { verification_status: "Verified", verified_by: actor.email, verified_at: new Date().toISOString(), admin_remarks: i.reason.trim() }, { actor: actor.email, expectedUpdatedAt: row.updated_at });
  try { await updateById(SHEETS.Document_Registry, doc.document_id, { verification_status: "Verified", verified_by: actor.email, verified_at: new Date().toISOString() }, { actor: actor.email }); }
  catch (e) { warning = "Details verified, but the admit card document status could not be updated."; console.error(safeMessage(e)); }
  if (after.travel_required === "Yes" || after.accommodation_required === "Yes") {
    try { await ensureTravelFromAdmit(asg, after, actor.email); } catch (e) { warning = (warning ? warning + " " : "") + "Verified, but the travel record could not be created. Create it from Travel & Accommodation."; console.error(safeMessage(e)); }
  }
  await audit(actor, "admit.verify", "ADMIT", row.admit_id, "success", row, after);
  await notifySme({ smeId: row.sme_id, examId: row.exam_id, type: "admit_review", key: `admit:${row.admit_id}:verify:${after.updated_at}`, actor: actor.email, subject: "Your exam details were verified", message: `Exam on ${after.confirmed_exam_date} at ${after.reporting_time}, ${after.centre_name}.` });
  return { admit: after, warning };
}
