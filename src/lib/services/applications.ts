import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, query, updateById, type Row } from "@/lib/sheets/store";
import { audit } from "@/lib/audit";
import { notifySme } from "@/lib/notifications";
import { assertOwnership, type Session } from "@/lib/auth/session";
import { applicationInput } from "@/lib/validation";
import { HttpError, safeMessage } from "@/lib/http";
import { DOC_TYPES } from "@/lib/files";
import { REVIEW_TRANSITIONS, SME_EDITABLE_STATUSES, type ReviewAction } from "@/lib/constants";

const A = SHEETS.Exam_Assignments, APP = SHEETS.Application_Responses, EXAM = SHEETS.Exam_Master;

export async function getOwnApplication(s: Session, assignmentId: string) {
  const asg = await findById(A, assignmentId);
  if (!asg) throw new HttpError(404, "Assignment not found.");
  assertOwnership(s, asg);
  const [app] = await query(APP, (r) => r.assignment_id === assignmentId);
  const exam = await findById(EXAM, asg.exam_id);
  if (!app || !exam) throw new HttpError(404, "Application not found.");
  assertOwnership(s, app);
  return { assignment: asg, application: app, exam };
}

const REQUIRED_ON_SUBMIT: [keyof Row, string][] = [["registration_no", "Enter the registration number"], ["applied_post", "Enter the applied post or level"], ["centre_city", "Enter the selected centre or city"], ["amount_paid", "Enter the amount paid"], ["payment_mode", "Choose the payment mode"]];

export async function saveOwnApplication(s: Session, assignmentId: string, raw: unknown) {
  const { assignment, application, exam } = await getOwnApplication(s, assignmentId);
  if (assignment.assignment_status !== "Active") throw new HttpError(409, "This assignment is no longer active.");
  if (!SME_EDITABLE_STATUSES.includes(application.status)) {
    throw new HttpError(409, application.status === "Verified" ? "This application is verified. Ask an administrator to reopen it for corrections." : `This application is "${application.status}" and cannot be edited.`);
  }
  const { submit, expected_updated_at, ...data } = applicationInput.parse(raw);
  const merged: Row = { ...application, ...(data as Record<string, string>) };
  if (submit) {
    const fields: Record<string, string> = {};
    for (const [k, msg] of REQUIRED_ON_SUBMIT) if (!(merged[k] ?? "").trim()) fields[k] = msg;
    if (Object.keys(fields).length) throw new HttpError(400, "Complete the required fields before submitting.", { fields });
  }
  const nextStatus = submit ? "Submitted" : application.status === "Not Started" ? "In Progress" : application.status;
  const patch: Partial<Row> = { ...(data as Record<string, string>), status: nextStatus };
  if (submit) { patch.submitted_at = new Date().toISOString(); patch.correction_note = ""; }
  const after = await updateById(APP, application.application_id, patch, { actor: s.email, expectedUpdatedAt: expected_updated_at ?? application.updated_at });
  await audit(s, submit ? "application.submit" : "application.save", "APPLICATION", after.application_id, "success", application, after);

  // Mirror status onto the assignment row. Application_Responses stays the source of truth if this fails.
  let warning: string | undefined;
  try { await updateById(A, assignment.assignment_id, { application_status: nextStatus }, { actor: s.email }); }
  catch (e) { warning = "Saved, but the assignment summary could not be refreshed."; console.error("mirror failed", safeMessage(e)); }
  void exam;
  return { application: after, warning };
}

export async function reviewApplication(actor: Session, applicationId: string, action: ReviewAction, reason: string) {
  const rule = REVIEW_TRANSITIONS[action];
  if (!rule) throw new HttpError(400, "Unknown review action.");
  const before = await findById(APP, applicationId);
  if (!before) throw new HttpError(404, "Application not found.");
  if (!rule.from.includes(before.status)) throw new HttpError(409, `Cannot apply this action to an application that is "${before.status}".`);
  if (rule.reasonRequired && !reason.trim()) throw new HttpError(400, "Enter a reason. The SME will see it.");
  if (action === "verify") {
    const docs = await query(SHEETS.Document_Registry, (d) => d.assignment_id === before.assignment_id && !["Superseded", "Rejected"].includes(d.verification_status));
    const need = ["application_form", ...(Number(before.amount_paid) > 0 ? ["payment_receipt"] : [])].filter((t) => !docs.some((d) => d.doc_type === t));
    if (need.length) throw new HttpError(409, `Cannot verify yet. Missing documents: ${need.map((t) => DOC_TYPES[t as keyof typeof DOC_TYPES].label).join(", ")}.`);
  }
  const patch: Partial<Row> = { status: rule.to, correction_note: rule.reasonRequired ? reason.trim().slice(0, 500) : "" };
  if (action === "verify") { patch.verified_by = actor.email; patch.verified_at = new Date().toISOString(); }
  const after = await updateById(APP, applicationId, patch, { actor: actor.email, expectedUpdatedAt: before.updated_at });
  await audit(actor, `application.${action}`, "APPLICATION", applicationId, "success", before, after);
  try { await updateById(A, before.assignment_id, { application_status: rule.to }, { actor: actor.email }); } catch (e) { console.error("mirror failed", safeMessage(e)); }
  const subject = { start_review: "Your application is being reviewed", verify: "Your application was verified", request_correction: "Correction needed on your application", reject: "Your application was rejected" }[action];
  await notifySme({ smeId: before.sme_id, examId: before.exam_id, type: "verification_result", key: `review:${applicationId}:${action}:${after.updated_at}`, actor: actor.email, subject, message: rule.reasonRequired ? `Reason: ${reason.trim().slice(0, 300)}` : "Open the application for details." });
  return after;
}
