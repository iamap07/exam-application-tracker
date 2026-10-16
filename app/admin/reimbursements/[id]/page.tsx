import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { canViewFinancial } from "@/lib/auth/permissions";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, query } from "@/lib/sheets/store";
import { reimbDisplayStatus } from "@/lib/services/reimbursements";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import DecisionPanel, { type DecisionAction } from "@/components/client/DecisionPanel";
import DocList from "@/components/DocList";

export default async function ReimbDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin();
  if (!(await canViewFinancial(s))) return <Notice kind="warn">Reimbursement details are restricted for your role.</Notice>;
  const { id } = await params;
  const [r] = await query(SHEETS.Reimbursement_Tracker, (x) => x.assignment_id === id);
  if (!r) notFound();
  const [sme, exam, docs, [app]] = await Promise.all([findById(SHEETS.SME_Master, r.sme_id), findById(SHEETS.Exam_Master, r.exam_id), query(SHEETS.Document_Registry, (d) => d.assignment_id === id && d.verification_status !== "Superseded" && ["reimbursement_proof", "payment_receipt"].includes(d.doc_type)), query(SHEETS.Application_Responses, (a) => a.assignment_id === id)]);
  const st = r.approval_status;
  const A: DecisionAction[] = [];
  if (st === "Submitted for Approval") A.push({ key: "start_review", label: "Start review", variant: "secondary" });
  if (["Submitted for Approval", "Under Review"].includes(st)) {
    A.push({ key: "approve", label: "Approve", variant: "primary", fields: [{ name: "approved_amount", label: `Approved amount (claimed ${r.claimed_amount})` }], reason: "optional", reasonLabel: "Note (required if approving less than the claim)" });
    A.push({ key: "request_correction", label: "Request correction", reason: "required", reasonLabel: "What needs correcting? The SME sees this" });
    A.push({ key: "reject", label: "Reject", variant: "danger", reason: "required", reasonLabel: "Rejection reason (the SME sees this)" });
  }
  if (["Approved", "Partially Approved"].includes(st) && r.payment_status === "Payment Pending") A.push({ key: "record_payment", label: "Record payment", variant: "primary", fields: [{ name: "payment_date", label: "Payment date", type: "date" }, { name: "payment_ref", label: "Payment reference" }], confirm: "Record this claim as PAID? Only do this after the money has been sent." });
  if (["Eligible — Not Applied", "Applied — Documents Pending"].includes(st)) A.push({ key: "mark_not_eligible", label: "Mark not eligible", variant: "danger", reason: "required" });
  if (st === "Not Eligible") A.push({ key: "mark_eligible", label: "Mark eligible", variant: "secondary" });
  const rows: [string, string][] = [["SME", `${sme?.full_name} (${sme?.email})`], ["Examination", exam?.name ?? r.exam_id], ["Expected fee", r.expected_fee], ["Amount paid by SME", app?.amount_paid ?? r.amount_paid], ["Claimed", r.claimed_amount], ["Claim date", r.claim_date], ["Receipt uploaded", r.receipt_uploaded], ["Approved", r.approved_amount], ["Payment", r.payment_status === "Paid" ? `Paid ${r.payment_date}, ref ${r.payment_ref}` : r.payment_status], ["Rejection reason", r.rejection_reason], ["Admin note", r.admin_remarks]];
  return (
    <>
      <PageHeader title="Reimbursement" sub={r.reimbursement_id} actions={<Badge>{reimbDisplayStatus(r)}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Claim"><dl className="space-y-2 text-sm">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-slate-500">{k}</dt><dd className="break-words">{v || "—"}</dd></div>)}</dl></Card>
        <Card title="Decision"><DecisionPanel url={`/api/admin/reimbursements/${id}`} actions={A} /></Card>
        <Card title="Proof documents" className="lg:col-span-2"><DocList docs={docs} /></Card>
      </div>
    </>
  );
}
