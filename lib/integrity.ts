// Pure data-integrity checks for a Google-Sheets store that has no foreign keys or transactions.
type Row = Record<string, string>;
export interface Snapshot { smes: Row[]; exams: Row[]; assignments: Row[]; apps: Row[]; reimb: Row[]; admit: Row[]; travel: Row[]; docs: Row[]; notifications: Row[] }
export interface Issue { severity: "error" | "warn"; code: string; message: string; ref: string }

export function checkIntegrity(d: Snapshot): Issue[] {
  const out: Issue[] = [];
  const add = (severity: Issue["severity"], code: string, ref: string, message: string) => out.push({ severity, code, ref, message });
  const smeIds = new Set(d.smes.map((s) => s.sme_id)), examIds = new Set(d.exams.map((e) => e.exam_id));
  const asg = new Map(d.assignments.map((a) => [a.assignment_id, a]));

  const dup = (rows: Row[], col: string, code: string, label: string) => { const seen = new Set<string>(); for (const r of rows) { const v = (r[col] ?? "").toLowerCase(); if (!v) continue; if (seen.has(v)) add("error", code, r[col], `Duplicate ${label}: ${r[col]}`); seen.add(v); } };
  dup(d.smes, "email", "sme_dup_email", "SME email"); dup(d.smes, "auth_user_id", "sme_dup_auth", "SME login link");
  for (const s of d.smes) if (s.account_status === "Active" && !s.auth_user_id) add("warn", "sme_no_login", s.sme_id, `Active SME ${s.sme_id} has no linked login`);

  const active = new Set<string>();
  for (const a of d.assignments) {
    if (!smeIds.has(a.sme_id)) add("error", "asg_missing_sme", a.assignment_id, `Assignment ${a.assignment_id} points to a missing SME (${a.sme_id})`);
    if (!examIds.has(a.exam_id)) add("error", "asg_missing_exam", a.assignment_id, `Assignment ${a.assignment_id} points to a missing exam (${a.exam_id})`);
    if (a.assignment_status === "Active") { const k = `${a.exam_id}|${a.sme_id}`; if (active.has(k)) add("error", "asg_duplicate", a.assignment_id, `Exam ${a.exam_id} is assigned to ${a.sme_id} more than once`); active.add(k);
      if (!d.apps.some((p) => p.assignment_id === a.assignment_id)) add("warn", "asg_no_application", a.assignment_id, `Active assignment ${a.assignment_id} has no application record`); }
  }
  const owned = (rows: Row[], idCol: string, label: string) => { for (const r of rows) { const a = asg.get(r.assignment_id);
    if (!a) { add("error", `${label}_orphan`, r[idCol], `${label} ${r[idCol]} has no assignment (${r.assignment_id})`); continue; }
    if (a.sme_id !== r.sme_id || a.exam_id !== r.exam_id) add("error", `${label}_mismatch`, r[idCol], `${label} ${r[idCol]} belongs to a different SME/exam than its assignment (isolation risk)`); } };
  owned(d.apps, "application_id", "application"); owned(d.reimb, "reimbursement_id", "reimbursement"); owned(d.admit, "admit_id", "admit"); owned(d.travel, "travel_id", "travel"); owned(d.docs, "document_id", "document");
  dup(d.docs, "drive_file_id", "doc_dup_file", "Drive file id");

  for (const r of d.reimb) {
    const claimed = Number(r.claimed_amount) || 0, approved = Number(r.approved_amount) || 0;
    if (r.payment_status === "Paid" && (!r.payment_date || !r.payment_ref)) add("error", "rmb_paid_no_proof", r.reimbursement_id, `Paid claim ${r.reimbursement_id} lacks a payment date or reference`);
    if (r.payment_status === "Paid" && !["Approved", "Partially Approved"].includes(r.approval_status)) add("error", "rmb_paid_unapproved", r.reimbursement_id, `Claim ${r.reimbursement_id} is Paid but not approved`);
    if (["Approved", "Partially Approved"].includes(r.approval_status) && approved <= 0) add("error", "rmb_no_amount", r.reimbursement_id, `Approved claim ${r.reimbursement_id} has no approved amount`);
    if (approved > claimed && claimed > 0) add("error", "rmb_over_claim", r.reimbursement_id, `Claim ${r.reimbursement_id} approves more than was claimed`);
  }
  for (const a of d.admit) if (a.verification_status === "Verified" && (!a.confirmed_exam_date || !a.verified_by)) add("error", "admit_incomplete", a.admit_id, `Verified exam details ${a.admit_id} are missing a date or verifier`);
  for (const t of d.travel) { const a = d.admit.find((x) => x.assignment_id === t.assignment_id); if (a && a.verification_status !== "Verified") add("warn", "travel_unverified", t.travel_id, `Travel ${t.travel_id} exists while exam details are not verified`); }
  for (const p of d.apps) if (p.status === "Verified" && !d.docs.some((x) => x.assignment_id === p.assignment_id && x.doc_type === "application_form" && !["Superseded", "Rejected"].includes(x.verification_status))) add("warn", "app_verified_no_form", p.application_id, `Verified application ${p.application_id} has no application form on file`);
  for (const n of d.notifications) if (n.recipient_sme_id && !smeIds.has(n.recipient_sme_id)) add("warn", "ntf_missing_sme", n.notification_id, `Notification ${n.notification_id} targets a missing SME`);
  return out;
}
