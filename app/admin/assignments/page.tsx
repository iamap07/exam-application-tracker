import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { applyTable, parseQuery } from "@/lib/table";
import { APP_STATUSES } from "@/lib/constants";
import { readAll } from "@/lib/sheets/store";
import { SHEETS } from "@/lib/sheets/schema";
import { Badge, DataTable, FilterBar, PageHeader, btn } from "@/components/ui";
import ActionButton from "@/components/client/ActionButton";

export default async function Assignments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [b, { rows: map }] = await Promise.all([loadAll(), readAll(SHEETS.Drive_Folder_Map)]);
  const smeBy = new Map(b.smes.map((s) => [s.sme_id, s])), examBy = new Map(b.exams.map((e) => [e.exam_id, e]));
  const rows = b.assignments.map((a) => ({ ...a, sme_name: smeBy.get(a.sme_id)?.full_name ?? a.sme_id, exam_name: examBy.get(a.exam_id)?.name ?? a.exam_id, department: smeBy.get(a.sme_id)?.department ?? "", folder: map.find((m) => m.folder_key === `exam:${a.assignment_id}`)?.folder_url ?? "" }));
  const t = applyTable(rows, parseQuery(sp, ["assignment_status", "application_status", "exam_id", "department"]), ["sme_name", "exam_name", "assignment_id"]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Assignments" sub="Revoking keeps the history; the SME is notified." actions={<Link className={btn()} href={`/api/admin/export/assignments?${qs}`}>Export CSV</Link>} />
      <FilterBar sp={sp} filters={[{ key: "assignment_status", label: "Assignment", options: ["Active", "Revoked"] }, { key: "application_status", label: "Application", options: [...APP_STATUSES] }, { key: "department", label: "Department", options: [...new Set(rows.map((r) => r.department).filter(Boolean))].sort() }]} />
      <DataTable sp={sp} {...t} empty="No assignments yet. Open an examination and assign it to SMEs." cols={[
        { key: "sme_name", label: "SME", sortable: true }, { key: "exam_name", label: "Examination", sortable: true, render: (r) => <Link className="text-teal-800 underline" href={`/admin/exams/${r.exam_id}`}>{r.exam_name}</Link> },
        { key: "deadline", label: "Deadline", sortable: true }, { key: "priority", label: "Priority" },
        { key: "assignment_status", label: "Assignment", render: (r) => <Badge>{r.assignment_status}</Badge> }, { key: "ack_status", label: "Acknowledged", render: (r) => <Badge>{r.ack_status}</Badge> },
        { key: "application_status", label: "Application", render: (r) => <Badge>{r.application_status}</Badge> },
        { key: "folder", label: "Drive folder", render: (r) => r.assignment_status !== "Active" ? null : r.folder ? <a className="text-teal-800 underline" href={r.folder} target="_blank" rel="noopener noreferrer">Open</a> : <ActionButton label="Create folder" url={`/api/admin/assignments/${r.assignment_id}/folders`} /> },
        { key: "actions", label: "", render: (r) => r.assignment_status === "Active" ? <ActionButton label="Revoke" variant="danger" url={`/api/admin/assignments/${r.assignment_id}/revoke`} askReason="Why is this assignment being revoked? The SME will see this." /> : null },
      ]} />
    </>
  );
}
