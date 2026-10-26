import { requireRole } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import ActionButton from "@/components/client/ActionButton";

export default async function MyTravel() {
  const s = await requireRole("sme");
  const b = await loadAll();
  const mine = b.assignments.filter((a) => a.sme_id === s.smeId && a.assignment_status === "Active");
  const rows = mine.map((a) => ({ a, ex: b.exams.find((e) => e.exam_id === a.exam_id), t: b.travel.find((x) => x.assignment_id === a.assignment_id), ad: b.admit.find((x) => x.assignment_id === a.assignment_id) }))
    .filter((r) => r.t || r.ad?.travel_required === "Yes" || r.ad?.accommodation_required === "Yes");
  return (
    <>
      <PageHeader title="My travel & accommodation" sub="Company arrangements for your exams. Request support from My Admit Cards." />
      {rows.length === 0 && <Card><p className="text-sm text-slate-600">Nothing here yet. Arrangements start after an administrator verifies your exam details and you have asked for travel or accommodation.</p></Card>}
      <div className="space-y-6">{rows.map(({ a, ex, t, ad }) => (
        <Card key={a.assignment_id} title={ex?.name ?? a.exam_id}>
          {!t ? <Notice>Your request is noted. Arrangements begin once your exam details are verified.</Notice> : (
            <div className="space-y-4 text-sm">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><h3 className="mb-1 font-semibold">Travel <Badge>{t.travel_status}</Badge></h3>{t.travel_required === "Yes" ? <dl className="space-y-1"><div>Mode: {t.travel_mode || "—"}</div><div>Departure: {t.departure_at?.replace("T", " ") || "—"} from {t.departure_city || "—"}</div><div>Return: {t.return_at?.replace("T", " ") || "—"}</div><div>Booking reference: {t.travel_booking_ref || "—"}</div></dl> : <p className="text-slate-600">Not requested.</p>}</div>
                <div><h3 className="mb-1 font-semibold">Accommodation <Badge>{t.accommodation_status}</Badge></h3>{t.accommodation_required === "Yes" ? <dl className="space-y-1"><div>Property: {t.property_details || "—"}</div><div>Check-in: {t.check_in || "—"} · Check-out: {t.check_out || "—"}</div><div>Booking reference: {t.accommodation_booking_ref || "—"}</div></dl> : <p className="text-slate-600">Not requested.</p>}</div>
              </div>
              <p className="text-slate-600">Exam: {t.verified_exam_date} at {ad?.reporting_time}, {ad?.centre_name}, {t.centre_address}</p>
              {t.coordinator && <p className="text-slate-600">Your coordinator: {t.coordinator}</p>}
              {t.confirmation_document_id && <a className="text-teal-800 underline" href={`/api/documents/${t.confirmation_document_id}/download`}>Download booking confirmation</a>}
              {(t.travel_status === "Booked" || t.accommodation_status === "Booked") && t.sme_confirmed !== "Yes" && <div><ActionButton label="Confirm these arrangements" variant="primary" url={`/api/sme/travel/${a.assignment_id}`} confirm="Confirm that these travel and accommodation details work for you?" /></div>}
              {t.sme_confirmed === "Yes" && <Notice kind="success">You confirmed these arrangements.</Notice>}
            </div>)}
        </Card>))}</div>
    </>
  );
}
