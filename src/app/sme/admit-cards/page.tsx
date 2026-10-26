import { requireRole } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { getUploadPolicy } from "@/lib/services/documents";
import { admitFlags, FLAG_LABELS } from "@/lib/readiness";
import { todayIST } from "@/lib/dates";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import GenericForm, { type FieldDef } from "@/components/client/GenericForm";
import UploadForm from "@/components/client/UploadForm";

const yn = ["Yes", "No"];
const FIELDS: FieldDef[] = [
  { name: "confirmed_exam_date", label: "Exam date (as on admit card)", type: "date", required: true }, { name: "reporting_time", label: "Reporting time", type: "time", required: true },
  { name: "shift", label: "Shift" }, { name: "city", label: "Exam city", required: true },
  { name: "centre_name", label: "Exam centre name", required: true }, { name: "centre_address", label: "Exam centre address", type: "textarea", required: true },
  { name: "travel_required", label: "Do you need company travel?", type: "select", options: yn, required: true }, { name: "accommodation_required", label: "Do you need company accommodation?", type: "select", options: yn, required: true },
  { name: "extra_requirements", label: "Anything else we should know", type: "textarea" },
];

export default async function MyAdmitCards() {
  const s = await requireRole("sme");
  const [b, policy] = await Promise.all([loadAll(), getUploadPolicy()]);
  const mine = b.assignments.filter((a) => a.sme_id === s.smeId && a.assignment_status === "Active");
  const accept = policy.allowed.map((e) => "." + e).join(",");
  return (
    <>
      <PageHeader title="My admit cards" sub="Upload your admit card, then confirm the exam details. An administrator checks them against the card." />
      {mine.length === 0 && <Card><p className="text-sm text-slate-600">No exams assigned yet.</p></Card>}
      <div className="space-y-6">{mine.map((a) => {
        const ex = b.exams.find((e) => e.exam_id === a.exam_id); const ad = b.admit.find((r) => r.assignment_id === a.assignment_id);
        const doc = b.docs.find((d) => d.assignment_id === a.assignment_id && d.doc_type === "admit_card" && !["Superseded", "Rejected"].includes(d.verification_status));
        const status = ad?.verification_status ?? "Not Submitted"; const locked = status === "Verified";
        const flags = ex ? admitFlags({ exam: ex, admit: ad, hasDoc: !!doc, today: todayIST() }).filter((f) => ["date_differs"].includes(f)) : [];
        return (
          <Card key={a.assignment_id} title={ex?.name ?? a.exam_id}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3"><Badge>{status}</Badge><span className="text-sm text-slate-600">Scheduled exam date: {ex?.exam_date || "not announced yet"}{ex?.admit_card_expected ? ` · Admit card expected ${ex.admit_card_expected}` : ""}</span></div>
              {status === "Correction Required" && <Notice kind="warn"><strong>Correction needed:</strong> {ad?.admin_remarks}</Notice>}
              {status === "Verified" && <Notice kind="success">Verified by an administrator. Contact them to change anything.</Notice>}
              {status === "Pending Verification" && <Notice>Sent for verification. You can still correct details until it is verified.</Notice>}
              {flags.length > 0 && <Notice kind="warn">{flags.map((f) => FLAG_LABELS[f]).join(". ")}. This is fine if your admit card shows the new date.</Notice>}
              <div><h3 className="mb-2 text-sm font-semibold">1. Admit card {doc ? <><Badge>Yes</Badge> <a className="ml-2 text-sm font-normal text-teal-800 underline" href={`/api/documents/${doc.document_id}/download?inline=1`} target="_blank" rel="noopener noreferrer">View</a></> : null}</h3>{!locked && <UploadForm assignmentId={a.assignment_id} types={[]} fixedType="admit_card" replaceId={doc?.document_id} accept={accept} maxMb={policy.maxMb} label={doc ? "Replace" : "Upload"} />}</div>
              <div><h3 className="mb-2 text-sm font-semibold">2. Exam details</h3><GenericForm fields={FIELDS.map((f) => ({ ...f, readOnly: locked }))} initial={ad ?? {}} url={`/api/sme/admit-cards/${a.assignment_id}`} method="PUT" version={ad?.updated_at}
                actions={locked ? [] : [{ label: "Save draft", extra: { submit: false } }, { label: "Send for verification", primary: true, extra: { submit: true }, confirm: "Send these details for verification? Check them against your admit card first." }]} success="Saved." /></div>
            </div>
          </Card>);
      })}</div>
    </>
  );
}
