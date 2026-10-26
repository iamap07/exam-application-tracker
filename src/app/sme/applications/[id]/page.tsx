import { requireRole } from "@/lib/auth/session";
import { getOwnApplication } from "@/lib/services/applications";
import { SME_EDITABLE_STATUSES } from "@/lib/constants";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import GenericForm, { type FieldDef } from "@/components/client/GenericForm";

const FIELDS: FieldDef[] = [
  { name: "registration_no", label: "Application / registration number", required: true }, { name: "applied_post", label: "Applied post or exam level", required: true },
  { name: "centre_city", label: "Selected exam city or centre", required: true }, { name: "start_date", label: "Date you started applying", type: "date" },
  { name: "fee", label: "Application fee" }, { name: "amount_paid", label: "Amount you paid", required: true },
  { name: "payment_mode", label: "Payment mode", type: "select", options: ["UPI", "Card", "Net Banking", "Cash", "Other"], required: true }, { name: "payment_ref", label: "Payment transaction or reference ID" },
  { name: "remarks", label: "Remarks", type: "textarea" },
];

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("sme");
  const { id } = await params;
  const { application: a, exam, assignment } = await getOwnApplication(s, id); // 403 if the assignment belongs to someone else
  const editable = SME_EDITABLE_STATUSES.includes(a.status) && assignment.assignment_status === "Active";
  return (
    <>
      <PageHeader title={exam.name} sub={`${exam.exam_id} · ${assignment.sme_id}`} actions={<Badge>{a.status}</Badge>} />
      <div className="space-y-4">
        {a.status === "Correction Required" && <Notice kind="warn"><strong>Correction needed:</strong> {a.correction_note || "Check your details and submit again."}</Notice>}
        {a.status === "Verified" && <Notice kind="success">Verified. To change anything, ask your administrator to reopen it.</Notice>}
        {a.status === "Awaiting Verification" && <Notice>An administrator is reviewing this application.</Notice>}
        {a.status === "Submitted" && <Notice>Submitted on {a.submitted_at.slice(0, 10)}. You can still correct details until review starts.</Notice>}
        {a.status === "Rejected" && <Notice kind="error">Rejected: {a.correction_note || "No reason given."}</Notice>}
        <Card><GenericForm fields={FIELDS.map((f) => ({ ...f, readOnly: !editable }))} initial={a} url={`/api/sme/applications/${id}`} method="PUT" version={a.updated_at}
          actions={editable ? [{ label: "Save draft", extra: { submit: false } }, { label: a.status === "Submitted" ? "Resubmit" : "Submit application", extra: { submit: true }, primary: true, confirm: "Submit this application? Check the details first." }] : []} success="Saved." /></Card>
        <p className="text-xs text-slate-500">Uploading the application form, receipt and admit card is added with the Drive module.</p>
      </div>
    </>
  );
}
