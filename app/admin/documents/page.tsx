import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { SHEETS } from "@/lib/sheets/schema";
import { readAll } from "@/lib/sheets/store";
import { DOC_TYPES } from "@/lib/files";
import { applyTable, parseQuery } from "@/lib/table";
import { Badge, Card, DataTable, FilterBar, PageHeader } from "@/components/ui";
import DocList from "@/components/DocList";

export default async function AdminDocuments({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [b, { rows: map }] = await Promise.all([loadAll(), readAll(SHEETS.Drive_Folder_Map)]);
  const smeBy = new Map(b.smes.map((s) => [s.sme_id, s])), examBy = new Map(b.exams.map((e) => [e.exam_id, e]));
  const rows = b.docs.map((d) => ({ ...d, sme_name: smeBy.get(d.sme_id)?.full_name ?? d.sme_id, exam_name: examBy.get(d.exam_id)?.name ?? d.exam_id, folder: map.find((m) => m.folder_key === `exam:${d.assignment_id}`)?.folder_url ?? "" }));
  const t = applyTable(rows, parseQuery({ sort: "uploaded_at", dir: "desc", ...sp }, ["verification_status", "doc_type"]), ["sme_name", "exam_name", "file_name"]);
  return (
    <>
      <PageHeader title="Documents" sub="Uploading never verifies a document. Open it, compare it with the submitted details, then decide. Drive folder links open only for Google accounts you have shared the folder with." />
      <FilterBar sp={sp} filters={[{ key: "verification_status", label: "Status", options: ["Pending", "Verified", "Correction Required", "Rejected", "Superseded"] }, { key: "doc_type", label: "Type", options: Object.keys(DOC_TYPES) }]} />
      <DataTable sp={sp} {...t} empty="No documents match." cols={[
        { key: "sme_name", label: "SME", sortable: true }, { key: "exam_name", label: "Examination", sortable: true },
        { key: "doc_type", label: "Type", render: (r) => DOC_TYPES[r.doc_type as keyof typeof DOC_TYPES]?.label ?? r.doc_type },
        { key: "uploaded_at", label: "Uploaded", sortable: true, render: (r) => r.uploaded_at.slice(0, 10) },
        { key: "verification_status", label: "Status", render: (r) => <Badge>{r.verification_status}</Badge> },
        { key: "open", label: "", render: (r) => <span className="flex gap-3"><a className="text-teal-800 underline" href={`/api/documents/${r.document_id}/download?inline=1`} target="_blank" rel="noopener noreferrer">View</a>{r.folder && <a className="text-teal-800 underline" href={r.folder} target="_blank" rel="noopener noreferrer">Folder</a>}<Link className="text-teal-800 underline" href={`/admin/applications?q=${encodeURIComponent(r.sme_name)}`}>Application</Link></span> },
      ]} />
      <Card title="Review" className="mt-6"><p className="mb-3 text-sm text-slate-600">Documents awaiting a decision:</p><DocList docs={b.docs.filter((d) => d.verification_status === "Pending").slice(0, 15)} /></Card>
    </>
  );
}
