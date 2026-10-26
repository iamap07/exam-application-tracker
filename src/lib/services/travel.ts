import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { DuplicateError, insert, query, updateById, type Row } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { notifySme } from "@/lib/notifications";
import type { Session } from "@/lib/auth/session";
import { HttpError } from "@/lib/http";
import { travelInput } from "@/lib/validation";
import { anyAssignment, liveDocs, ownAssignment } from "./common";

const T = SHEETS.Travel_Accommodation;

/** Only exists once exam details are verified. Re-verification refreshes the exam facts but never resets booking progress. */
export async function ensureTravelFromAdmit(asg: Row, admit: Row, actor: string): Promise<Row> {
  if (admit.verification_status !== "Verified") throw new HttpError(409, "Exam details must be verified before arranging travel or accommodation.");
  const facts = { verified_exam_date: admit.confirmed_exam_date, centre_address: admit.centre_address, destination_city: admit.city };
  const find = async () => (await query(T, (r) => r.assignment_id === asg.assignment_id))[0];
  const ex = await find();
  if (ex) return updateById(T, ex.travel_id, { ...facts, travel_required: admit.travel_required, accommodation_required: admit.accommodation_required }, { actor });
  try {
    return await insert(T, { travel_id: newId("TRV"), accommodation_id: newId("ACC"), assignment_id: asg.assignment_id, exam_id: asg.exam_id, sme_id: asg.sme_id, ...facts,
      travel_required: admit.travel_required, accommodation_required: admit.accommodation_required, special_requirements: admit.extra_requirements,
      travel_status: admit.travel_required === "Yes" ? "Pending Review" : "Not Required", accommodation_status: admit.accommodation_required === "Yes" ? "Pending Review" : "Not Required", sme_confirmed: "No", created_by: actor, updated_by: actor });
  } catch (e) { if (e instanceof DuplicateError) return (await find())!; throw e; }
}

export async function createTravelRecord(actor: Session, assignmentId: string) {
  const asg = await anyAssignment(assignmentId);
  const [admit] = await query(SHEETS.Admit_Card_Tracker, (r) => r.assignment_id === assignmentId);
  if (!admit) throw new HttpError(409, "No exam details have been submitted for this assignment.");
  const row = await ensureTravelFromAdmit(asg, admit, actor.email);
  await audit(actor, "travel.create", "TRAVEL", row.travel_id, "success");
  return row;
}

export async function updateTravel(actor: Session, assignmentId: string, raw: unknown) {
  const { expected_updated_at, ...input } = travelInput.parse(raw);
  const [row] = await query(T, (r) => r.assignment_id === assignmentId);
  if (!row) throw new HttpError(404, "No travel record yet. It is created when exam details are verified.");
  const [admit] = await query(SHEETS.Admit_Card_Tracker, (r) => r.assignment_id === assignmentId);
  if (admit?.verification_status !== "Verified") throw new HttpError(409, "Exam details are not verified (they may have been reopened). Re-verify before changing arrangements.");
  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Record<string, string>;
  const m = { ...row, ...patch };
  const err = (field: string, msg: string): never => { throw new HttpError(400, msg, { fields: { [field]: msg } }); };
  if (m.travel_required === "No") patch.travel_status = m.travel_status = "Not Required";
  if (m.accommodation_required === "No") patch.accommodation_status = m.accommodation_status = "Not Required";
  if (m.travel_required === "Yes" && m.travel_status === "Not Required") err("travel_status", "Travel is required; choose a different status.");
  if (m.accommodation_required === "Yes" && m.accommodation_status === "Not Required") err("accommodation_status", "Accommodation is required; choose a different status.");
  if (patch.travel_status === "Confirmed with SME" && row.travel_status !== "Booked" && row.travel_status !== "Confirmed with SME") err("travel_status", "Only a booked trip can be confirmed with the SME.");
  if (patch.accommodation_status === "Confirmed with SME" && row.accommodation_status !== "Booked" && row.accommodation_status !== "Confirmed with SME") err("accommodation_status", "Only a booked stay can be confirmed with the SME.");
  if (["Booked", "Confirmed with SME"].includes(m.travel_status)) {
    if (!m.travel_booking_ref) err("travel_booking_ref", "Enter the booking reference before marking travel as booked.");
    if (!m.departure_at) err("departure_at", "Enter the departure date and time.");
  }
  if (["Booked", "Confirmed with SME"].includes(m.accommodation_status)) {
    if (!m.property_details) err("property_details", "Enter the hotel or property details.");
    if (!m.accommodation_booking_ref) err("accommodation_booking_ref", "Enter the booking reference.");
    if (!m.check_in || !m.check_out) err("check_in", "Enter check-in and check-out dates.");
  }
  if (m.check_in && m.check_out && m.check_out < m.check_in) err("check_out", "Check-out must be on or after check-in.");
  if (m.departure_at && m.return_at && m.return_at < m.departure_at) err("return_at", "Return must be after departure.");
  const doc = (await liveDocs(assignmentId, "travel_accommodation"))[0];
  if (doc) patch.confirmation_document_id = doc.document_id;
  if (patch.travel_status === "Confirmed with SME" || patch.accommodation_status === "Confirmed with SME") patch.sme_confirmed = "Yes";
  const after = await updateById(T, row.travel_id, patch, { actor: actor.email, expectedUpdatedAt: expected_updated_at ?? row.updated_at });
  await audit(actor, "travel.update", "TRAVEL", row.travel_id, "success", row, after);
  const changed = (k: "travel_status" | "accommodation_status") => after[k] !== row[k] && ["Booked", "Cancelled"].includes(after[k]);
  if (changed("travel_status") || changed("accommodation_status")) {
    await notifySme({ smeId: row.sme_id, examId: row.exam_id, type: "travel_update", key: `trv:${row.travel_id}:${after.travel_status}:${after.accommodation_status}:${after.updated_at}`, actor: actor.email, subject: "Travel / accommodation update",
      message: [changed("travel_status") ? `Travel is now ${after.travel_status.toLowerCase()}.` : "", changed("accommodation_status") ? `Accommodation is now ${after.accommodation_status.toLowerCase()}.` : "", "Open My Travel & Accommodation for details."].filter(Boolean).join(" ") });
  }
  return after;
}

export async function confirmTravel(s: Session, assignmentId: string) {
  await ownAssignment(s, assignmentId);
  const [row] = await query(T, (r) => r.assignment_id === assignmentId);
  if (!row) throw new HttpError(404, "No arrangements to confirm yet.");
  const patch: Record<string, string> = {};
  if (row.travel_status === "Booked") patch.travel_status = "Confirmed with SME";
  if (row.accommodation_status === "Booked") patch.accommodation_status = "Confirmed with SME";
  if (!Object.keys(patch).length) throw new HttpError(409, "Nothing is waiting for your confirmation.");
  patch.sme_confirmed = "Yes";
  const after = await updateById(T, row.travel_id, patch, { actor: s.email });
  await audit(s, "travel.sme_confirm", "TRAVEL", row.travel_id, "success", row, after);
  return after;
}
