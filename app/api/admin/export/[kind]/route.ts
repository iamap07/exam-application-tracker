import { requireAdmin } from "@/lib/auth/session";
import { canViewFinancial } from "@/lib/auth/permissions";
import { HttpError, route } from "@/lib/http";
import { loadAll } from "@/lib/services/dashboard";
import { toCsv } from "@/lib/csv";
import { audit } from "@/lib/audit";
import { requireFinancial } from "@/lib/services/common";
import { todayIST } from "@/lib/dates";

export const GET = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { kind } = await ctx.params;
  const url = new URL(req.url);
  const b = await loadAll();
  const smeBy = new Map(b.smes.map((x) => [x.sme_id, x])), examBy = new Map(b.exams.map((x) => [x.exam_id, x]));
  const fin = await canViewFinancial(s);
  const status = url.searchParams.get("status"), examId = url.searchParams.get("exam_id");
  let headers: string[]; let rows: Record<string, string>[];
  if (kind === "applications") {
    headers = ["application_id", "sme_id", "sme_name", "exam_id", "exam_name", "status", "submitted_at", "registration_no", "applied_post", "centre_city", ...(fin ? ["fee", "amount_paid", "payment_mode", "payment_ref"] : [])];
    rows = b.apps.filter((a) => (!status || a.status === status) && (!examId || a.exam_id === examId)).map((a) => ({ ...a, sme_name: smeBy.get(a.sme_id)?.full_name ?? "", exam_name: examBy.get(a.exam_id)?.name ?? "" }));
  } else if (kind === "assignments") {
    headers = ["assignment_id", "exam_id", "exam_name", "sme_id", "sme_name", "assignment_date", "deadline", "priority", "assignment_status", "ack_status", "application_status"];
    rows = b.assignments.filter((a) => (!examId || a.exam_id === examId)).map((a) => ({ ...a, sme_name: smeBy.get(a.sme_id)?.full_name ?? "", exam_name: examBy.get(a.exam_id)?.name ?? "" }));
  } else if (kind === "reimbursements") {
    await requireFinancial(s);
    headers = ["reimbursement_id", "sme_name", "exam_name", "eligible", "expected_fee", "amount_paid", "claimed_amount", "approved_amount", "approval_status", "payment_status", "claim_date", "payment_date", "payment_ref", "rejection_reason"];
    rows = b.reimb.filter((r) => !examId || r.exam_id === examId).map((r) => ({ ...r, sme_name: smeBy.get(r.sme_id)?.full_name ?? "", exam_name: examBy.get(r.exam_id)?.name ?? "" }));
  } else if (kind === "travel") {
    headers = ["sme_name", "exam_name", "verified_exam_date", "centre_address", "departure_city", "destination_city", "travel_required", "travel_mode", "departure_at", "return_at", "travel_status", "travel_booking_ref", "accommodation_required", "check_in", "check_out", "accommodation_status", "property_details", "accommodation_booking_ref", "coordinator", "sme_confirmed", "special_requirements"];
    rows = b.travel.filter((r) => !examId || r.exam_id === examId).map((r) => ({ ...r, sme_name: smeBy.get(r.sme_id)?.full_name ?? "", exam_name: examBy.get(r.exam_id)?.name ?? "" }));
  } else if (kind === "upcoming") {
    const t = todayIST();
    headers = ["exam_id", "name", "organization", "category", "application_deadline", "admit_card_expected", "exam_date", "exam_end_date", "city_centre", "status", "assigned_smes"];
    rows = b.exams.filter((e) => e.exam_date >= t && e.status !== "Cancelled").sort((x, y) => x.exam_date.localeCompare(y.exam_date)).map((e) => ({ ...e, assigned_smes: String(b.assignments.filter((a) => a.exam_id === e.exam_id && a.assignment_status === "Active").length) }));
  } else if (kind === "admit") {
    headers = ["sme_name", "exam_name", "admit_card_uploaded", "verification_status", "confirmed_exam_date", "reporting_time", "centre_name", "centre_address", "city", "shift", "travel_required", "accommodation_required", "sme_confirmed_at", "verified_by", "verified_at"];
    rows = b.admit.filter((r) => !examId || r.exam_id === examId).map((r) => ({ ...r, sme_name: smeBy.get(r.sme_id)?.full_name ?? "", exam_name: examBy.get(r.exam_id)?.name ?? "" }));
  } else if (kind === "accommodation") {
    headers = ["sme_name", "exam_name", "verified_exam_date", "destination_city", "accommodation_required", "check_in", "check_out", "accommodation_status", "property_details", "accommodation_booking_ref", ...(fin ? ["approved_budget"] : []), "coordinator", "sme_confirmed", "special_requirements"];
    rows = b.travel.filter((r) => r.accommodation_required === "Yes" && (!examId || r.exam_id === examId)).map((r) => ({ ...r, sme_name: smeBy.get(r.sme_id)?.full_name ?? "", exam_name: examBy.get(r.exam_id)?.name ?? "" }));
  } else throw new HttpError(404, "Unknown export. Available: applications, assignments, reimbursements, upcoming, admit, travel, accommodation.");
  await audit(s, "export", kind, `${rows.length} rows`, "success");
  return new Response(toCsv(headers, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
});
