import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { applyTable, parseQuery } from "@/lib/table";
import { APP_STATUSES } from "@/lib/constants";
import { Badge, DataTable, FilterBar, PageHeader, btn } from "@/components/ui";

export default async function Applications({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const b = await loadAll();
  const active = new Set(b.assignments.filter((a) => a.assignment_status === "Active").map((a) => a.assignment_id));
  const smeBy = new Map(b.smes.map((s) => [s.sme_id, s])), examBy = new Map(b.exams.map((e) => [e.exam_id, e]));
  const rows: Record<string, string>[] = b.apps.filter((a) => active.has(a.assignment_id)).map((a) => ({ ...a, sme_name: smeBy.get(a.sme_id)?.full_name ?? a.sme_id, exam_name: examBy.get(a.exam_id)?.name ?? a.exam_id, department: smeBy.get(a.sme_id)?.department ?? "" }));
  const t = applyTable(rows, parseQuery(sp, ["status", "exam_id", "department"]), ["sme_name", "exam_name", "registration_no", "application_id"]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Applications" actions={<Link className={btn()} href={`/api/admin/export/applications?${qs}`}>Export CSV</Link>} />
      <FilterBar sp={sp} filters={[{ key: "status", label: "Status", options: [...APP_STATUSES] }, { key: "exam_id", label: "Exam ID", options: [...new Set(rows.map((r) => r.exam_id))] }, { key: "department", label: "Department", options: [...new Set(rows.map((r) => r.department).filter(Boolean))].sort() }]} />
      <DataTable sp={sp} {...t} empty="No applications match these filters." cols={[
        { key: "sme_name", label: "SME", sortable: true }, { key: "exam_name", label: "Examination", sortable: true },
        { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> }, { key: "submitted_at", label: "Submitted", sortable: true, render: (r) => r.submitted_at?.slice(0, 10) || "—" },
        { key: "registration_no", label: "Registration no." },
        { key: "open", label: "", render: (r) => <Link className="text-teal-800 underline" href={`/admin/applications/${r.application_id}`}>Review</Link> },
      ]} />
    </>
  );
}
