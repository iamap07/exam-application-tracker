import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { SHEETS } from "@/lib/sheets/schema";
import { readAll } from "@/lib/sheets/store";
import { applyTable, parseQuery } from "@/lib/table";
import { todayIST } from "@/lib/dates";
import { EXAM_STATUSES } from "@/lib/constants";
import { Badge, DataTable, FilterBar, PageHeader, btn } from "@/components/ui";
import GenericForm from "@/components/client/GenericForm";
import { EXAM_FIELDS } from "./fields";

export default async function Exams({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  let { rows } = await readAll(SHEETS.Exam_Master);
  if (sp.when === "upcoming") rows = rows.filter((r) => r.exam_date >= todayIST() && r.status !== "Cancelled");
  const t = applyTable(rows, parseQuery(sp, ["status", "category"]), ["name", "exam_id", "organization"]);
  return (
    <>
      <PageHeader title="Examinations" sub="Create an exam, set it to Open, then assign it to SMEs." actions={<Link className={btn()} href="/api/admin/export/upcoming">Export upcoming exams</Link>} />
      <details className="mb-6 rounded-lg border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Create an examination</summary><div className="mt-4"><GenericForm fields={EXAM_FIELDS} initial={{ status: "Draft", priority: "Normal", reimbursement_eligible: "No", travel_eligible: "No", accommodation_eligible: "No" }} url="/api/admin/exams" method="POST" actions={[{ label: "Create examination", primary: true }]} success="Examination created." resetOnSuccess /></div></details>
      <FilterBar sp={sp} filters={[{ key: "status", label: "Status", options: [...EXAM_STATUSES] }]} />
      <DataTable sp={sp} {...t} empty="No examinations yet. Create one above." cols={[
        { key: "name", label: "Examination", sortable: true, render: (r) => <Link className="font-medium text-teal-800 underline" href={`/admin/exams/${r.exam_id}`}>{r.name}<span className="block text-xs font-normal text-slate-500">{r.exam_id} · {r.organization}</span></Link> },
        { key: "application_deadline", label: "Apply by", sortable: true }, { key: "exam_date", label: "Exam date", sortable: true },
        { key: "status", label: "Status", render: (r) => <Badge>{r.status}</Badge> },
      ]} />
    </>
  );
}
