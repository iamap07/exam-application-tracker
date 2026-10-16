import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { admitFlags, FLAG_LABELS } from "@/lib/readiness";
import { applyTable, parseQuery } from "@/lib/table";
import { todayIST } from "@/lib/dates";
import { ADMIT_STATUSES } from "@/lib/constants";
import { Badge, DataTable, FilterBar, PageHeader, btn } from "@/components/ui";

export default async function AdmitCards({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const b = await loadAll(); const today = todayIST();
  const smeBy = new Map(b.smes.map((x) => [x.sme_id, x])), examBy = new Map(b.exams.map((e) => [e.exam_id, e]));
  const rows = b.assignments.filter((a) => a.assignment_status === "Active").map((a) => {
    const ad = b.admit.find((r) => r.assignment_id === a.assignment_id); const exam = examBy.get(a.exam_id)!;
    const hasDoc = b.docs.some((d) => d.assignment_id === a.assignment_id && d.doc_type === "admit_card" && !["Superseded", "Rejected"].includes(d.verification_status));
    const flags = exam ? admitFlags({ exam, admit: ad, hasDoc, today }) : [];
    return { assignment_id: a.assignment_id, sme_name: smeBy.get(a.sme_id)?.full_name ?? a.sme_id, exam_name: exam?.name ?? a.exam_id, exam_date: ad?.confirmed_exam_date || exam?.exam_date || "", status: ad?.verification_status ?? "Not Submitted", uploaded: hasDoc ? "Yes" : "No", flags: flags.map((f) => FLAG_LABELS[f]).join("|") };
  });
  const t = applyTable(rows, parseQuery(sp, ["status", "uploaded"]), ["sme_name", "exam_name"]);
  return (
    <>
      <PageHeader title="Admit cards & exam details" sub="Compare what the SME confirmed with the uploaded admit card before verifying." actions={<Link className={btn()} href="/api/admin/export/admit">Export CSV</Link>} />
      <FilterBar sp={sp} filters={[{ key: "status", label: "Status", options: [...ADMIT_STATUSES] }, { key: "uploaded", label: "Admit card uploaded", options: ["Yes", "No"] }]} />
      <DataTable sp={sp} {...t} empty="No assignments yet." cols={[
        { key: "sme_name", label: "SME", sortable: true }, { key: "exam_name", label: "Examination", sortable: true }, { key: "exam_date", label: "Exam date", sortable: true },
        { key: "uploaded", label: "Card uploaded", render: (r) => <Badge>{r.uploaded}</Badge> }, { key: "status", label: "Verification", render: (r) => <Badge>{r.status}</Badge> },
        { key: "flags", label: "Flags", render: (r) => r.flags ? <span className="flex flex-wrap gap-1">{r.flags.split("|").map((f) => <span key={f} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">{f}</span>)}</span> : "—" },
        { key: "open", label: "", render: (r) => <Link className="text-teal-800 underline" href={`/admin/admit-cards/${r.assignment_id}`}>Review</Link> },
      ]} />
    </>
  );
}
