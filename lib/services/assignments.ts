import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { DuplicateError, findById, insert, readAll, updateById, type Row } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { notifySme } from "@/lib/notifications";
import { assertOwnership, type Session } from "@/lib/auth/session";
import { assignInput } from "@/lib/validation";
import { HttpError, safeMessage } from "@/lib/http";
import { todayIST } from "@/lib/dates";
import { ensureAssignmentFolders } from "./drive-folders";
import { ensureReimbursement } from "./reimbursements";
import { ensureAdmit } from "./admit";

const A = SHEETS.Exam_Assignments, APP = SHEETS.Application_Responses, EXAM = SHEETS.Exam_Master, SME = SHEETS.SME_Master;
type Input = ReturnType<typeof assignInput.parse>;

async function assignableExam(examId: string) {
  const exam = await findById(EXAM, examId);
  if (!exam) throw new HttpError(404, "Examination not found.");
  if (!["Open", "Assigned"].includes(exam.status)) throw new HttpError(409, `This examination is "${exam.status}". Set it to Open before assigning SMEs.`);
  return exam;
}

async function resolveTargets(i: Input): Promise<Row[]> {
  const { rows: smes } = await readAll(SME);
  if (i.mode === "single" || i.mode === "selected") {
    if (i.mode === "single" && i.sme_ids.length !== 1) throw new HttpError(400, "Choose exactly one SME.");
    if (i.sme_ids.length === 0) throw new HttpError(400, "Choose at least one SME.");
    const ids = new Set(i.sme_ids);
    const found = smes.filter((s) => ids.has(s.sme_id) && s.account_status !== "Deactivated");
    if (found.length !== ids.size) throw new HttpError(400, "One or more selected SMEs do not exist or are deactivated.");
    return found;
  }
  const active = smes.filter((s) => s.account_status === "Active");
  if (i.mode === "all") return active;
  if (!i.department && !i.subject) throw new HttpError(400, "Set a department or subject filter.");
  return active.filter((s) => (!i.department || s.department.toLowerCase() === i.department.toLowerCase()) && (!i.subject || s.subjects.toLowerCase().includes(i.subject.toLowerCase())));
}

export async function previewAssignment(raw: unknown) {
  const i = assignInput.parse(raw);
  await assignableExam(i.exam_id);
  const targets = await resolveTargets(i);
  const { rows: existing } = await readAll(A);
  const byKey = new Map(existing.filter((a) => a.exam_id === i.exam_id).map((a) => [a.sme_id, a]));
  const pick = (f: (a?: Row) => boolean) => targets.filter((t) => f(byKey.get(t.sme_id))).map((t) => ({ sme_id: t.sme_id, full_name: t.full_name }));
  const alreadyAssigned = pick((a) => a?.assignment_status === "Active");
  const toCreate = pick((a) => !a), toReassign = pick((a) => a?.assignment_status === "Revoked");
  return { recipients: targets.length, alreadyAssigned, toCreate, toReassign, willAssign: toCreate.length + toReassign.length, requiresConfirmation: i.mode !== "single" };
}

export async function assign(actor: Session, raw: unknown) {
  const i = assignInput.parse(raw);
  const exam = await assignableExam(i.exam_id);
  const pv = await previewAssignment(i);
  if (pv.requiresConfirmation && i.expected_count !== pv.willAssign) {
    throw new HttpError(409, `The recipient list changed (now ${pv.willAssign}). Review the confirmation again.`, { preview: pv });
  }
  const { rows: existing } = await readAll(A);
  const byKey = new Map(existing.filter((a) => a.exam_id === i.exam_id).map((a) => [a.sme_id, a]));
  const deadline = i.deadline || exam.application_deadline;
  const results: { sme_id: string; outcome: "created" | "reassigned" | "duplicate" | "failed"; error?: string; notified?: boolean; folder?: "ok" | "failed" }[] = [];
  const targets = [...pv.toCreate, ...pv.toReassign, ...pv.alreadyAssigned];

  for (const t of targets) {
    const prior = byKey.get(t.sme_id);
    if (prior?.assignment_status === "Active") { results.push({ sme_id: t.sme_id, outcome: "duplicate" }); continue; }
    try {
      const fields = { assignment_date: todayIST(), deadline, assigned_by: actor.email, priority: i.priority, assignment_status: "Active", ack_status: "Pending", admin_remarks: i.remarks };
      let asg: Row;
      if (prior) asg = await updateById(A, prior.assignment_id, { ...fields, revoked_at: "", revoked_by: "" }, { actor: actor.email });
      else asg = await insert(A, { assignment_id: newId("ASG"), exam_id: i.exam_id, sme_id: t.sme_id, application_status: "Not Started", created_by: actor.email, updated_by: actor.email, ...fields });
      try {
        await insert(APP, { application_id: newId("APP"), assignment_id: asg.assignment_id, exam_id: i.exam_id, sme_id: t.sme_id, status: "Not Started", fee: exam.fee, reimbursement_eligible: exam.reimbursement_eligible, created_by: actor.email, updated_by: actor.email });
      } catch (e) { if (!(e instanceof DuplicateError)) throw e; }
      const notified = await notifySme({ smeId: t.sme_id, examId: i.exam_id, type: "new_assignment", key: `assign:${asg.assignment_id}:${asg.assignment_date}`, actor: actor.email,
        subject: `New examination assigned: ${exam.name}`, message: `You have been assigned "${exam.name}". Application deadline: ${deadline || "to be announced"}.` });
      try { await ensureReimbursement(asg, actor.email); await ensureAdmit(asg, actor.email); }
      catch (e) { await audit(actor, "tracker.ensure", "ASSIGNMENT", asg.assignment_id, "failure", undefined, { error: safeMessage(e) }); } // rows are also created on first save
      let folder: "ok" | "failed" = "ok";
      try { await ensureAssignmentFolders(asg.assignment_id, actor.email); }
      catch (e) { folder = "failed"; await audit(actor, "drive.folders.ensure", "ASSIGNMENT", asg.assignment_id, "failure", undefined, { error: safeMessage(e) }); }
      await audit(actor, prior ? "assignment.reassign" : "assignment.create", "ASSIGNMENT", asg.assignment_id, "success", prior, asg);
      results.push({ sme_id: t.sme_id, outcome: prior ? "reassigned" : "created", notified, folder });
    } catch (e) {
      await audit(actor, "assignment.create", "ASSIGNMENT", `${i.exam_id}:${t.sme_id}`, "failure", undefined, { error: safeMessage(e) });
      results.push({ sme_id: t.sme_id, outcome: "failed", error: safeMessage(e) });
    }
  }
  if (exam.status === "Open" && results.some((r) => r.outcome === "created" || r.outcome === "reassigned")) {
    await updateById(EXAM, exam.exam_id, { status: "Assigned" }, { actor: actor.email });
  }
  const count = (o: string) => results.filter((r) => r.outcome === o).length;
  return { results, summary: { created: count("created"), reassigned: count("reassigned"), duplicates: count("duplicate"), failed: count("failed"), notificationFailures: results.filter((r) => r.notified === false).length, folderFailures: results.filter((r) => r.folder === "failed").length } };
}

export async function revokeAssignment(actor: Session, assignmentId: string, reason: string) {
  if (!reason.trim()) throw new HttpError(400, "Enter a reason for revoking.");
  const before = await findById(A, assignmentId);
  if (!before) throw new HttpError(404, "Assignment not found.");
  if (before.assignment_status !== "Active") throw new HttpError(409, "This assignment is not active.");
  const after = await updateById(A, assignmentId, { assignment_status: "Revoked", revoked_at: new Date().toISOString(), revoked_by: actor.email, admin_remarks: reason.trim().slice(0, 500) }, { actor: actor.email });
  await audit(actor, "assignment.revoke", "ASSIGNMENT", assignmentId, "success", before, after);
  await notifySme({ smeId: before.sme_id, examId: before.exam_id, type: "assignment_revoked", key: `revoke:${assignmentId}:${after.revoked_at}`, actor: actor.email, subject: "An examination assignment was withdrawn", message: `Reason: ${reason.trim().slice(0, 300)}` });
  return after;
}

export async function acknowledge(s: Session, assignmentId: string) {
  const a = await findById(A, assignmentId);
  if (!a) throw new HttpError(404, "Assignment not found.");
  assertOwnership(s, a);
  if (a.assignment_status !== "Active") throw new HttpError(409, "This assignment is no longer active.");
  if (a.ack_status === "Acknowledged") return a;
  const after = await updateById(A, assignmentId, { ack_status: "Acknowledged" }, { actor: s.email });
  await audit(s, "assignment.acknowledge", "ASSIGNMENT", assignmentId, "success");
  return after;
}
