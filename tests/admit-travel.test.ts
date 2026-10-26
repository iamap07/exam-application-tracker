import { describe, expect, it } from "vitest";
import { reviewAdmit, saveAdmitDetails } from "@/lib/services/admit";
import { uploadDocument } from "@/lib/services/documents";
import { confirmTravel, createTravelRecord, updateTravel } from "@/lib/services/travel";
import { ADMIN, assignOne, errOf, key, pdfFile, rows, seedExam, seedSme, smeSession } from "./helpers";

async function setup() {
  const sme = await seedSme("S1", "Asha"); const exam = await seedExam(); const asg = await assignOne(exam.exam_id, "S1"); const S = smeSession(sme);
  const details = (over: Record<string, unknown> = {}) => ({ confirmed_exam_date: exam.exam_date, reporting_time: "08:30", centre_name: "ABC School", centre_address: "12 MG Road", city: "Pune", shift: "1", travel_required: "Yes", accommodation_required: "Yes", ...over });
  const card = () => uploadDocument(S, { assignmentId: asg, docType: "admit_card", uploadKey: key(), file: pdfFile("card.pdf") });
  const admit = async () => (await rows("Admit_Card_Tracker"))[0];
  const travel = async () => (await rows("Travel_Accommodation"))[0];
  const verified = async () => { await card(); await saveAdmitDetails(S, asg, { ...details(), submit: true }); await reviewAdmit(ADMIN, asg, { action: "verify" }); };
  return { S, asg, exam, details, card, admit, travel, verified };
}

describe("admit card and exam details", () => {
  it("uploading a card records it but never verifies anything", async () => {
    const { card, admit } = await setup(); await card();
    expect(await admit()).toMatchObject({ admit_card_uploaded: "Yes", verification_status: "Not Submitted", verified_by: "" });
  });
  it("sending details needs every field and an uploaded card; drafts are allowed", async () => {
    const { S, asg, details, card, admit } = await setup();
    await saveAdmitDetails(S, asg, { city: "Pune" });
    expect((await admit()).verification_status).toBe("Not Submitted");
    const e = await errOf(saveAdmitDetails(S, asg, { ...details({ centre_name: "" }), submit: true }));
    expect(e.status).toBe(400); expect(Object.keys(e.extra.fields)).toContain("centre_name");
    await expect(saveAdmitDetails(S, asg, { ...details(), submit: true })).rejects.toThrow(/Upload your admit card/);
    await card();
    await saveAdmitDetails(S, asg, { ...details(), submit: true });
    expect(await admit()).toMatchObject({ verification_status: "Pending Verification", city: "Pune" }); expect((await admit()).sme_confirmed_at).toBeTruthy();
  });
  it("a partial save does not erase other details", async () => {
    const { S, asg, details, admit } = await setup();
    await saveAdmitDetails(S, asg, details()); await saveAdmitDetails(S, asg, { shift: "2" });
    expect(await admit()).toMatchObject({ city: "Pune", centre_name: "ABC School", shift: "2" });
  });
  it("admin cannot verify without a card or before the SME sends details", async () => {
    const { S, asg, details, card } = await setup();
    await expect(reviewAdmit(ADMIN, asg, { action: "verify" })).rejects.toMatchObject({ status: 409 });
    await saveAdmitDetails(S, asg, { ...details() });
    await expect(reviewAdmit(ADMIN, asg, { action: "verify" })).rejects.toMatchObject({ status: 409 });
    await card();
    await expect(reviewAdmit(ADMIN, asg, { action: "verify" })).rejects.toMatchObject({ status: 409 }); // still not submitted
  });
  it("a date that differs from the exam schedule needs explicit acceptance", async () => {
    const { S, asg, details, card } = await setup(); await card();
    await saveAdmitDetails(S, asg, { ...details({ confirmed_exam_date: "2031-01-02" }), submit: true });
    const e = await errOf(reviewAdmit(ADMIN, asg, { action: "verify" }));
    expect(e.status).toBe(409); expect(e.extra.needsDateConfirmation).toBe(true);
    expect((await reviewAdmit(ADMIN, asg, { action: "verify", accept_date_difference: true })).admit.verification_status).toBe("Verified");
  });
  it("verifying also marks the card document verified and creates the travel record", async () => {
    const { verified, travel } = await setup(); await verified();
    expect((await rows("Document_Registry"))[0].verification_status).toBe("Verified");
    expect(await travel()).toMatchObject({ travel_status: "Pending Review", accommodation_status: "Pending Review", destination_city: "Pune", sme_confirmed: "No" });
  });
  it("no travel record when neither travel nor accommodation is needed", async () => {
    const { S, asg, details, card } = await setup(); await card();
    await saveAdmitDetails(S, asg, { ...details({ travel_required: "No", accommodation_required: "No" }), submit: true });
    await reviewAdmit(ADMIN, asg, { action: "verify" });
    expect(await rows("Travel_Accommodation")).toHaveLength(0);
    await expect(createTravelRecord(ADMIN, asg)).resolves.toBeTruthy(); // admin can still create one deliberately
  });
  it("verified details lock for the SME; reopening needs a reason; a new card forces re-verification", async () => {
    const { S, asg, details, verified, admit, card } = await setup(); await verified();
    await expect(saveAdmitDetails(S, asg, { city: "Goa" })).rejects.toMatchObject({ status: 409 });
    await expect(reviewAdmit(ADMIN, asg, { action: "request_correction" })).rejects.toThrow(/Enter what/);
    await reviewAdmit(ADMIN, asg, { action: "request_correction", reason: "Wrong shift" });
    expect(await admit()).toMatchObject({ verification_status: "Correction Required", admin_remarks: "Wrong shift", verified_by: "" });
    await saveAdmitDetails(S, asg, { ...details({ shift: "2" }), submit: true }); await reviewAdmit(ADMIN, asg, { action: "verify" });
    await card();
    expect(await admit()).toMatchObject({ verification_status: "Pending Verification" }); expect((await admit()).admin_remarks).toMatch(/re-verify/);
  });
});

describe("travel and accommodation", () => {
  it("validates bookings: reference required, dates in order, confirm only after booked", async () => {
    const { verified, asg } = await setup(); await verified();
    const t = (p: Record<string, unknown>) => updateTravel(ADMIN, asg, p);
    expect((await errOf(t({ travel_status: "Booked" }))).extra.fields).toHaveProperty("travel_booking_ref");
    expect((await errOf(t({ travel_status: "Booked", travel_booking_ref: "PNR1" }))).extra.fields).toHaveProperty("departure_at");
    expect((await errOf(t({ accommodation_status: "Booked", property_details: "Hotel", accommodation_booking_ref: "H1", check_in: "2031-01-05", check_out: "2031-01-04" }))).extra.fields).toHaveProperty("check_out");
    expect((await errOf(t({ travel_status: "Confirmed with SME" }))).extra.fields).toHaveProperty("travel_status");
    expect((await errOf(t({ departure_at: "2031-01-05T10:00", return_at: "2031-01-04T10:00" }))).extra.fields).toHaveProperty("return_at");
  });
  it("books, notifies the SME, lets the SME confirm, and records it", async () => {
    const { verified, asg, S, travel } = await setup(); await verified();
    await expect(confirmTravel(S, asg)).rejects.toMatchObject({ status: 409 });
    await updateTravel(ADMIN, asg, { travel_status: "Booked", travel_booking_ref: "PNR1", departure_at: "2031-01-04T06:00", return_at: "2031-01-06T20:00", travel_mode: "Train", coordinator: "Ops Lead" });
    await updateTravel(ADMIN, asg, { accommodation_status: "Booked", property_details: "Hotel Sun", accommodation_booking_ref: "H1", check_in: "2031-01-04", check_out: "2031-01-06" });
    expect((await rows("Notifications")).filter((n) => n.type === "travel_update")).toHaveLength(2);
    await confirmTravel(S, asg);
    expect(await travel()).toMatchObject({ travel_status: "Confirmed with SME", accommodation_status: "Confirmed with SME", sme_confirmed: "Yes" });
  });
  it("'not required' is enforced when the SME needs no travel; arrangements pause when verification is reopened", async () => {
    const { verified, asg } = await setup(); await verified();
    const out = await updateTravel(ADMIN, asg, { travel_required: "No", travel_status: "Booked" });
    expect(out.travel_status).toBe("Not Required");
    await reviewAdmit(ADMIN, asg, { action: "request_correction", reason: "Re-check city" });
    await expect(updateTravel(ADMIN, asg, { remarks: "x" })).rejects.toMatchObject({ status: 409 });
  });
  it("re-verification refreshes exam facts without resetting booking progress", async () => {
    const { S, asg, details, verified, travel } = await setup(); await verified();
    await updateTravel(ADMIN, asg, { travel_status: "Approved" });
    await reviewAdmit(ADMIN, asg, { action: "request_correction", reason: "City change" });
    await saveAdmitDetails(S, asg, { ...details({ city: "Nashik" }), submit: true }); await reviewAdmit(ADMIN, asg, { action: "verify" });
    expect(await travel()).toMatchObject({ destination_city: "Nashik", travel_status: "Approved" });
    expect(await rows("Travel_Accommodation")).toHaveLength(1);
  });
});
