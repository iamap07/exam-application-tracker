import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { applyTable, parseQuery } from "@/lib/table";
import { ACC_STATUSES, TRAVEL_STATUSES } from "@/lib/constants";
import { Badge, DataTable, FilterBar, PageHeader, btn } from "@/components/ui";
import ActionButton from "@/components/client/ActionButton";

export default async function TravelList({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const b = await loadAll();
  const smeBy = new Map(b.smes.map((x) => [x.sme_id, x])), examBy = new Map(b.exams.map((e) => [e.exam_id, e]));
  const rows = b.travel.map((t) => ({ ...t, sme_name: smeBy.get(t.sme_id)?.full_name ?? t.sme_id, exam_name: examBy.get(t.exam_id)?.name ?? t.exam_id }));
  const t = applyTable(rows, parseQuery(sp, ["travel_status", "accommodation_status"]), ["sme_name", "exam_name", "destination_city"]);
  // Verified exam details with travel/accommodation needs but no record (e.g. creation failed earlier).
  const missing = b.admit.filter((a) => a.verification_status === "Verified" && (a.travel_required === "Yes" || a.accommodation_required === "Yes") && !b.travel.some((t2) => t2.assignment_id === a.assignment_id));
  return (
    <>
      <PageHeader title="Travel & accommodation" sub="Records appear after exam details are verified. This module tracks company arrangements; it never books anything." actions={<><Link className={btn()} href="/admin/readiness">Readiness</Link><Link className={btn()} href="/api/admin/export/travel">Export travel report</Link><Link className={btn()} href="/api/admin/export/accommodation">Export accommodation report</Link></>} />
      {missing.length > 0 && <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"><p className="mb-2 font-medium text-amber-900">{missing.length} verified exam(s) need a travel record:</p><div className="flex flex-wrap gap-2">{missing.map((a) => <ActionButton key={a.assignment_id} label={`Create for ${smeBy.get(a.sme_id)?.full_name ?? a.sme_id}`} url={`/api/admin/travel/${a.assignment_id}`} />)}</div></div>}
      <FilterBar sp={sp} filters={[{ key: "travel_status", label: "Travel", options: [...TRAVEL_STATUSES] }, { key: "accommodation_status", label: "Accommodation", options: [...ACC_STATUSES] }]} />
      <DataTable sp={sp} {...t} empty="No travel or accommodation records yet." cols={[
        { key: "sme_name", label: "SME", sortable: true }, { key: "exam_name", label: "Examination" }, { key: "verified_exam_date", label: "Exam date", sortable: true }, { key: "destination_city", label: "Destination" },
        { key: "travel_status", label: "Travel", render: (r) => <Badge>{r.travel_status}</Badge> }, { key: "accommodation_status", label: "Accommodation", render: (r) => <Badge>{r.accommodation_status}</Badge> },
        { key: "sme_confirmed", label: "SME confirmed" },
        { key: "open", label: "", render: (r) => <Link className="text-teal-800 underline" href={`/admin/travel/${r.assignment_id}`}>Manage</Link> },
      ]} />
    </>
  );
}
