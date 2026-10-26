import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, query } from "@/lib/sheets/store";
import { getUploadPolicy } from "@/lib/services/documents";
import { ACC_STATUSES, TRAVEL_MODES, TRAVEL_STATUSES } from "@/lib/constants";
import { Card, PageHeader } from "@/components/ui";
import GenericForm, { type FieldDef } from "@/components/client/GenericForm";
import UploadForm from "@/components/client/UploadForm";
import DocList from "@/components/DocList";

const yn = ["Yes", "No"];
const FIELDS: FieldDef[] = [
  { name: "departure_city", label: "Departure city" }, { name: "destination_city", label: "Destination city" },
  { name: "travel_required", label: "Travel required", type: "select", options: yn }, { name: "travel_mode", label: "Travel mode", type: "select", options: [...TRAVEL_MODES] },
  { name: "departure_at", label: "Departure", type: "datetime-local" }, { name: "return_at", label: "Return", type: "datetime-local" },
  { name: "travel_status", label: "Travel status", type: "select", options: [...TRAVEL_STATUSES] }, { name: "travel_booking_ref", label: "Travel booking reference" },
  { name: "accommodation_required", label: "Accommodation required", type: "select", options: yn }, { name: "accommodation_status", label: "Accommodation status", type: "select", options: [...ACC_STATUSES] },
  { name: "check_in", label: "Check-in", type: "date" }, { name: "check_out", label: "Check-out", type: "date" },
  { name: "property_details", label: "Hotel / property details" }, { name: "accommodation_booking_ref", label: "Accommodation booking reference" },
  { name: "approved_budget", label: "Approved budget" }, { name: "coordinator", label: "Admin coordinator" },
  { name: "special_requirements", label: "Special requirements", type: "textarea" }, { name: "remarks", label: "Remarks", type: "textarea" },
];

export default async function TravelDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [t] = await query(SHEETS.Travel_Accommodation, (r) => r.assignment_id === id);
  if (!t) notFound();
  const [sme, exam, docs, policy] = await Promise.all([findById(SHEETS.SME_Master, t.sme_id), findById(SHEETS.Exam_Master, t.exam_id), query(SHEETS.Document_Registry, (d) => d.assignment_id === id && d.doc_type === "travel_accommodation" && d.verification_status !== "Superseded"), getUploadPolicy()]);
  return (
    <>
      <PageHeader title={`${sme?.full_name}: ${exam?.name}`} sub={`Verified exam date ${t.verified_exam_date} · ${t.centre_address}${sme?.emergency_contact ? ` · Emergency contact: ${sme.emergency_contact}` : ""}`} />
      <div className="space-y-6">
        <Card title="Arrangements"><GenericForm fields={FIELDS} initial={t} url={`/api/admin/travel/${id}`} method="PATCH" version={t.updated_at} actions={[{ label: "Save arrangements", primary: true }]} success="Saved. The SME is notified when something is booked or cancelled." /></Card>
        <Card title="Booking confirmations"><DocList docs={docs} /><div className="mt-4"><UploadForm assignmentId={id} types={[]} fixedType="travel_accommodation" accept={policy.allowed.map((e) => "." + e).join(",")} maxMb={policy.maxMb} label="Upload confirmation" /></div></Card>
      </div>
    </>
  );
}
