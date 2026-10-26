import { requireRole } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { getUploadPolicy } from "@/lib/services/documents";
import { DOC_TYPES } from "@/lib/files";
import { Badge, Card, PageHeader } from "@/components/ui";
import UploadForm from "@/components/client/UploadForm";

export default async function MyDocuments() {
  const s = await requireRole("sme");
  const [b, policy] = await Promise.all([loadAll(), getUploadPolicy()]);
  const mine = b.assignments.filter((a) => a.sme_id === s.smeId && a.assignment_status === "Active");
  const accept = policy.allowed.map((e) => "." + e).join(",");
  const types = Object.entries(DOC_TYPES).filter(([, v]) => v.smeCanUpload).map(([value, v]) => ({ value, label: v.label }));
  return (
    <>
      <PageHeader title="My documents" sub="Files go into your private folder for each exam. Only you and administrators can open them." />
      {mine.length === 0 && <Card><p className="text-sm text-slate-600">No exams assigned yet.</p></Card>}
      <div className="space-y-6">{mine.map((a) => {
        const ex = b.exams.find((e) => e.exam_id === a.exam_id);
        const docs = b.docs.filter((d) => d.assignment_id === a.assignment_id && d.verification_status !== "Superseded");
        return (
          <Card key={a.assignment_id} title={ex?.name ?? a.exam_id}>
            {docs.length === 0 ? <p className="mb-4 text-sm text-slate-600">Nothing uploaded yet.</p> : (
              <ul className="mb-4 divide-y divide-slate-100">{docs.map((d) => (
                <li key={d.document_id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><div className="font-medium">{DOC_TYPES[d.doc_type as keyof typeof DOC_TYPES]?.label ?? d.doc_type}</div><div className="text-xs text-slate-500">{d.file_name} · {d.uploaded_at.slice(0, 10)}</div></div>
                    <div className="flex items-center gap-3"><Badge>{d.verification_status}</Badge><a className="text-teal-800 underline" href={`/api/documents/${d.document_id}/download?inline=1`} target="_blank" rel="noopener noreferrer">View</a><a className="text-teal-800 underline" href={`/api/documents/${d.document_id}/download`}>Download</a></div>
                  </div>
                  {d.admin_remarks && <p className="mt-1 text-xs text-rose-800">Admin note: {d.admin_remarks}</p>}
                  {d.verification_status !== "Verified" && <details className="mt-2"><summary className="cursor-pointer text-xs text-teal-800">Replace this file</summary><div className="mt-2"><UploadForm assignmentId={a.assignment_id} types={types} fixedType={d.doc_type} replaceId={d.document_id} accept={accept} maxMb={policy.maxMb} label="Replace" /></div></details>}
                </li>))}</ul>)}
            <UploadForm assignmentId={a.assignment_id} types={types} accept={accept} maxMb={policy.maxMb} />
          </Card>);
      })}</div>
    </>
  );
}
