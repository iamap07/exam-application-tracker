import { requireRole } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { reimbDisplayStatus } from "@/lib/services/reimbursements";
import { getUploadPolicy } from "@/lib/services/documents";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import GenericForm from "@/components/client/GenericForm";
import UploadForm from "@/components/client/UploadForm";

const EDITABLE = ["Eligible — Not Applied", "Applied — Documents Pending", "Correction Required"];

export default async function MyReimbursements() {
  const s = await requireRole("sme");
  const [b, policy] = await Promise.all([loadAll(), getUploadPolicy()]);
  const mine = b.assignments.filter((a) => a.sme_id === s.smeId && a.assignment_status === "Active");
  const accept = policy.allowed.map((e) => "." + e).join(",");
  return (
    <>
      <PageHeader title="My reimbursements" sub="Claim back your exam fee. Approval and payment are tracked separately." />
      {mine.length === 0 && <Card><p className="text-sm text-slate-600">No exams assigned yet.</p></Card>}
      <div className="space-y-6">{mine.map((a) => {
        const ex = b.exams.find((e) => e.exam_id === a.exam_id); const r = b.reimb.find((x) => x.assignment_id === a.assignment_id);
        const app = b.apps.find((x) => x.assignment_id === a.assignment_id);
        const hasProof = b.docs.some((d) => d.assignment_id === a.assignment_id && ["reimbursement_proof", "payment_receipt"].includes(d.doc_type) && !["Superseded", "Rejected"].includes(d.verification_status));
        return (
          <Card key={a.assignment_id} title={ex?.name ?? a.exam_id}>
            {!r ? <p className="text-sm text-slate-600">Your reimbursement record is not set up yet. Save your application first or contact an administrator.</p> : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3"><Badge>{reimbDisplayStatus(r)}</Badge>{r.eligible === "Yes" ? <span className="text-sm text-slate-600">Fee {r.expected_fee || "—"} · Paid by you {app?.amount_paid || "—"}</span> : <span className="text-sm text-slate-600">Not eligible for reimbursement.</span>}</div>
                {r.approval_status === "Correction Required" && <Notice kind="warn"><strong>Correction needed:</strong> {r.admin_remarks}</Notice>}
                {r.approval_status === "Rejected" && <Notice kind="error">Rejected: {r.rejection_reason}</Notice>}
                {["Approved", "Partially Approved"].includes(r.approval_status) && <Notice kind={r.payment_status === "Paid" ? "success" : "info"}>Approved amount: <strong>{r.approved_amount}</strong>. {r.payment_status === "Paid" ? `Paid on ${r.payment_date} (ref ${r.payment_ref}).` : "Payment has not been made yet."}{r.admin_remarks ? ` Note: ${r.admin_remarks}` : ""}</Notice>}
                {r.eligible === "Yes" && EDITABLE.includes(r.approval_status) && (<>
                  <div><h3 className="mb-2 text-sm font-semibold">1. Upload your payment receipt or proof {hasProof && <Badge>Yes</Badge>}</h3><UploadForm assignmentId={a.assignment_id} types={[]} fixedType="reimbursement_proof" accept={accept} maxMb={policy.maxMb} /></div>
                  <div><h3 className="mb-2 text-sm font-semibold">2. Your claim</h3><GenericForm fields={[{ name: "claimed_amount", label: "Amount you are claiming", required: true, help: `Up to the amount you paid${app?.amount_paid ? ` (${app.amount_paid})` : ""}.` }]} initial={r} url={`/api/sme/reimbursements/${a.assignment_id}`} method="PUT" version={r.updated_at} actions={[{ label: "Save claim", extra: { submit: false } }, { label: "Submit for approval", primary: true, extra: { submit: true }, confirm: "Submit this claim for approval?" }]} success="Saved." /></div>
                </>)}
                {r.claim_date && <p className="text-xs text-slate-500">Submitted on {r.claim_date}. Claimed {r.claimed_amount}.</p>}
              </div>)}
          </Card>);
      })}</div>
    </>
  );
}
