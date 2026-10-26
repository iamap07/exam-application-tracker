import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { Badge, DataTable, PageHeader } from "@/components/ui";
import { applyTable, parseQuery } from "@/lib/table";

export default async function MyApplications({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireRole("sme");
  const sp = await searchParams;
  const b = await loadAll();
  const active = new Set(b.assignments.filter((a) => a.sme_id === s.smeId && a.assignment_status === "Active").map((a) => a.assignment_id));
  let rows: Record<string, string>[] = b.apps.filter((a) => a.sme_id === s.smeId && active.has(a.assignment_id)).map((a) => ({ ...a, exam_name: b.exams.find((e) => e.exam_id === a.exam_id)?.name ?? a.exam_id }));
  if (sp.group === "pending") rows = rows.filter((r) => ["Not Started", "In Progress", "Correction Required"].includes(r.status));
  const t = applyTable(rows, parseQuery(sp, ["status"]), ["exam_name", "registration_no"]);
  return (
    <>
      <PageHeader title="My applications" />
      <DataTable sp={sp} {...t} empty="No applications here yet." cols={[
        { key: "exam_name", label: "Examination", sortable: true }, { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
        { key: "submitted_at", label: "Submitted", render: (r) => r.submitted_at?.slice(0, 10) || "—" },
        { key: "open", label: "", render: (r) => <Link className="text-teal-800 underline" href={`/sme/applications/${r.assignment_id}`}>Open</Link> },
      ]} />
    </>
  );
}
