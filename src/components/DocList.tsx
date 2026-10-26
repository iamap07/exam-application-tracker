import { DOC_TYPES } from "@/lib/files";
import { Badge } from "./ui";
import ActionButton from "./client/ActionButton";

export default function DocList({ docs }: { docs: Record<string, string>[] }) {
  if (!docs.length) return <p className="text-sm text-slate-500">No documents uploaded.</p>;
  return (
    <ul className="divide-y divide-slate-100">{docs.map((d) => (
      <li key={d.document_id} className="py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><div className="font-medium">{DOC_TYPES[d.doc_type as keyof typeof DOC_TYPES]?.label ?? d.doc_type}</div><div className="text-xs text-slate-500">{d.file_name} · {d.uploaded_at.slice(0, 10)} · by {d.uploaded_by}</div></div>
          <div className="flex items-center gap-3"><Badge>{d.verification_status}</Badge><a className="text-teal-800 underline" href={`/api/documents/${d.document_id}/download?inline=1`} target="_blank" rel="noopener noreferrer">View</a><a className="text-teal-800 underline" href={`/api/documents/${d.document_id}/download`}>Download</a></div>
        </div>
        {d.admin_remarks && <p className="mt-1 text-xs text-slate-600">Note: {d.admin_remarks}</p>}
        {d.verification_status !== "Superseded" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {d.verification_status !== "Verified" && <ActionButton label="Verify" variant="primary" url={`/api/admin/documents/${d.document_id}/review`} body={{ action: "verify" }} />}
            <ActionButton label="Request correction" url={`/api/admin/documents/${d.document_id}/review`} body={{ action: "request_correction" }} askReason="What needs to be corrected? The SME will see this." />
            {d.verification_status !== "Rejected" && <ActionButton label="Reject" variant="danger" url={`/api/admin/documents/${d.document_id}/review`} body={{ action: "reject" }} askReason="Why is this document rejected? The SME will see this." />}
          </div>)}
      </li>))}</ul>
  );
}
