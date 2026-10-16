import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { canViewFinancial } from "@/lib/auth/permissions";
import { loadAll } from "@/lib/services/dashboard";
import { getPolicy } from "@/lib/services/common";
import { reimbDisplayStatus } from "@/lib/services/reimbursements";
import { applyTable, parseQuery } from "@/lib/table";
import { daysBetween, todayIST } from "@/lib/dates";
import { REIMB_APPROVAL, REIMB_PAYMENT } from "@/lib/constants";
import { Badge, Card, DataTable, FilterBar, Kpi, Notice, PageHeader, btn } from "@/components/ui";

export default async function Reimbursements({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireAdmin();
  if (!(await canViewFinancial(s))) return (<><PageHeader title="Reimbursements" /><Notice kind="warn">Reimbursement amounts are restricted for your role. A Super Admin can grant access in Settings.</Notice></>);
  const sp = await searchParams;
  const [b, policy] = await Promise.all([loadAll(), getPolicy()]);
  const today = todayIST();
  const smeBy = new Map(b.smes.map((x) => [x.sme_id, x])), examBy = new Map(b.exams.map((e) => [e.exam_id, e]));
  const live = new Set(b.assignments.filter((a) => a.assignment_status === "Active").map((a) => a.assignment_id));
  const all: Record<string, string>[] = b.reimb.filter((r) => live.has(r.assignment_id)).map((r) => ({ ...r, sme_name: smeBy.get(r.sme_id)?.full_name ?? r.sme_id, exam_name: examBy.get(r.exam_id)?.name ?? r.exam_id, department: smeBy.get(r.sme_id)?.department ?? "", shown: reimbDisplayStatus(r),
    overdue: r.claim_date && r.payment_status !== "Paid" && !["Rejected", "Not Eligible"].includes(r.approval_status) && daysBetween(r.claim_date, today) > policy.overdueDays ? "Yes" : "" }));
  let rows = all; if (sp.overdue === "1") rows = rows.filter((r) => r.overdue);
  const t = applyTable(rows, parseQuery(sp, ["approval_status", "payment_status", "department"]), ["sme_name", "exam_name"]);
  const sum = (f: (r: Record<string, string>) => boolean, k: string) => all.filter(f).reduce((n, r) => n + (Number(r[k]) || 0), 0);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Reimbursements" sub="Approval and payment are separate steps. Approving never marks a claim as paid." actions={<Link className={btn()} href={`/api/admin/export/reimbursements?${qs}`}>Export CSV</Link>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Claimed (submitted claims)" value={sum((r) => ["Submitted for Approval", "Under Review", "Approved", "Partially Approved"].includes(r.approval_status), "claimed_amount")} />
        <Kpi label="Approved, awaiting payment" value={sum((r) => r.payment_status === "Payment Pending", "approved_amount")} href="?payment_status=Payment Pending" />
        <Kpi label="Paid" value={sum((r) => r.payment_status === "Paid", "approved_amount")} href="?payment_status=Paid" />
        <Kpi label={`Overdue (over ${policy.overdueDays} days)`} value={all.filter((r) => r.overdue).length} href="?overdue=1" />
      </div>
      <FilterBar sp={sp} filters={[{ key: "approval_status", label: "Approval", options: [...REIMB_APPROVAL] }, { key: "payment_status", label: "Payment", options: [...REIMB_PAYMENT] }, { key: "department", label: "Department", options: [...new Set(all.map((r) => r.department).filter(Boolean))].sort() }]} />
      <DataTable sp={sp} {...t} empty="No reimbursement records match." cols={[
        { key: "sme_name", label: "SME", sortable: true }, { key: "exam_name", label: "Examination", sortable: true },
        { key: "claimed_amount", label: "Claimed", sortable: true }, { key: "approved_amount", label: "Approved" },
        { key: "shown", label: "Status", render: (r) => <span className="flex flex-wrap gap-1"><Badge>{r.shown}</Badge>{r.overdue && <Badge>Overdue</Badge>}</span> },
        { key: "claim_date", label: "Claimed on", sortable: true },
        { key: "open", label: "", render: (r) => <Link className="text-teal-800 underline" href={`/admin/reimbursements/${r.assignment_id}`}>Open</Link> },
      ]} />
    </>
  );
}
