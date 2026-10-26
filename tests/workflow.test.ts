// End-to-end business workflow through the real services (Sheets/Drive/email/Supabase are in-memory fakes).
// Mirrors the acceptance criteria; the real integrations still need the staging checks in docs/PRODUCTION_CHECKLIST.md.
import { describe, expect, it } from "vitest";
import { getSession } from "@/lib/auth/session";
import { createSme, activateOnLogin } from "@/lib/services/smes";
import { assign, acknowledge } from "@/lib/services/assignments";
import { getOwnApplication, reviewApplication, saveOwnApplication } from "@/lib/services/applications";
import { fetchDocument, uploadDocument } from "@/lib/services/documents";
import { reviewReimbursement, saveClaim } from "@/lib/services/reimbursements";
import { reviewAdmit, saveAdmitDetails } from "@/lib/services/admit";
import { confirmTravel, updateTravel } from "@/lib/services/travel";
import { deliverPending } from "@/lib/services/notify";
import { runJob } from "@/lib/services/jobs";
import { adminDashboard, loadAll, smeDashboard } from "@/lib/services/dashboard";
import { checkIntegrity } from "@/lib/integrity";
import { authState, driveState, emailState } from "./fakes/state";
import { ADMIN, key, pdfFile, rows, seedExam, today, addDays } from "./helpers";

const login = async (email: string) => { const inv = authState.invited.find((i) => i.email === email)!; authState.currentUser = { id: inv.id, email, app_metadata: { role: "sme" } }; await activateOnLogin(); return (await getSession())!; };

describe("acceptance workflow", () => {
  it("runs the whole lifecycle and leaves consistent data", async () => {
    // 1. Admin creates SMEs; each logs in and sees only their own data
    await createSme(ADMIN, { full_name: "Asha Rao", email: "asha@x.test", department: "Physics", mobile: "9876543210", designation: "Lecturer", emergency_contact: "Mom 9999999999" });
    await createSme(ADMIN, { full_name: "Bala Iyer", email: "bala@x.test", department: "Chemistry" });
    const A = await login("asha@x.test"), B = await login("bala@x.test");
    expect(A.smeId).not.toBe(B.smeId);

    // 2. Admin creates an exam, assigns several SMEs, notifications are delivered
    const exam = await seedExam({ application_deadline: addDays(today(), 3), exam_date: addDays(today(), 12) });
    const res = await assign(ADMIN, { exam_id: exam.exam_id, mode: "all", expected_count: 2 });
    expect(res.summary).toMatchObject({ created: 2, failed: 0, folderFailures: 0 });
    expect((await deliverPending({ limit: 20, retryFailed: true })).sent).toBe(2);
    expect(emailState.sent.map((e) => e.to).sort()).toEqual(["asha@x.test", "bala@x.test"]);
    const aAsg = (await rows("Exam_Assignments")).find((x) => x.sme_id === A.smeId)!.assignment_id, bAsg = (await rows("Exam_Assignments")).find((x) => x.sme_id === B.smeId)!.assignment_id;
    await acknowledge(A, aAsg);

    // 3. SMEs submit applications and upload documents into their own private folders
    for (const [S, asg] of [[A, aAsg], [B, bAsg]] as const) {
      await saveOwnApplication(S, asg, { registration_no: `R-${S.smeId}`, applied_post: "Lecturer", centre_city: "Pune", amount_paid: "1000", payment_mode: "UPI", submit: true });
      await uploadDocument(S, { assignmentId: asg, docType: "application_form", uploadKey: key(), file: pdfFile("form.pdf") });
      await uploadDocument(S, { assignmentId: asg, docType: "payment_receipt", uploadKey: key(), file: pdfFile("receipt.pdf") });
    }
    const folders = driveState.items.filter((i) => i.isFolder && i.name.startsWith("Exam_"));
    expect(folders).toHaveLength(2); expect(new Set(folders.map((f) => f.parent)).size).toBe(2); // each SME has their own folder
    await expect(fetchDocument(A, (await rows("Document_Registry")).find((d) => d.sme_id === B.smeId)!.document_id)).rejects.toMatchObject({ status: 403 });

    // 4. Admin verifies one application and requests a correction on the other
    const apps = await rows("Application_Responses");
    await reviewApplication(ADMIN, apps.find((a) => a.sme_id === A.smeId)!.application_id, "verify", "");
    await reviewApplication(ADMIN, apps.find((a) => a.sme_id === B.smeId)!.application_id, "request_correction", "Check the centre city");
    expect((await getOwnApplication(B, bAsg)).application.status).toBe("Correction Required");

    // 5. Reimbursement: claim -> approval -> payment, each independent
    await uploadDocument(A, { assignmentId: aAsg, docType: "reimbursement_proof", uploadKey: key(), file: pdfFile("proof.pdf") });
    await saveClaim(A, aAsg, { claimed_amount: "1000", submit: true });
    const approved = await reviewReimbursement(ADMIN, aAsg, { action: "approve", approved_amount: "1000" });
    expect(approved.payment_status).toBe("Payment Pending");
    expect((await reviewReimbursement(ADMIN, aAsg, { action: "record_payment", payment_date: today(), payment_ref: "UTR9" })).payment_status).toBe("Paid");

    // 6. Admit card and exam details are verified by an admin
    await uploadDocument(A, { assignmentId: aAsg, docType: "admit_card", uploadKey: key(), file: pdfFile("admit.pdf") });
    await saveAdmitDetails(A, aAsg, { confirmed_exam_date: exam.exam_date, reporting_time: "08:00", centre_name: "ABC School", centre_address: "12 MG Road", city: "Pune", travel_required: "Yes", accommodation_required: "Yes", submit: true });
    await reviewAdmit(ADMIN, aAsg, { action: "verify" });

    // 7. Travel and accommodation are tracked through booking and SME confirmation
    await updateTravel(ADMIN, aAsg, { travel_status: "Booked", travel_booking_ref: "PNR1", departure_at: `${exam.exam_date}T05:00`, accommodation_status: "Booked", property_details: "Hotel Sun", accommodation_booking_ref: "H1", check_in: exam.exam_date, check_out: exam.exam_date });
    await confirmTravel(A, aAsg);
    expect((await rows("Travel_Accommodation"))[0]).toMatchObject({ travel_status: "Confirmed with SME", accommodation_status: "Confirmed with SME", sme_confirmed: "Yes" });

    // 8. Reminders run through the job without duplicates (B still needs to fix the application and upload an admit card)
    await runJob("reminders", "cron"); const afterFirst = (await rows("Notifications")).length;
    await runJob("reminders", "cron"); await runJob("reminders", "cron");
    expect((await rows("Notifications")).length).toBe(afterFirst);
    expect((await rows("Notifications")).some((n) => n.recipient_sme_id === B.smeId && n.type.startsWith("reminder_"))).toBe(true);
    expect((await rows("Notifications")).some((n) => n.recipient_sme_id === A.smeId && n.type === "reminder_deadline")).toBe(false); // A is done

    // 9. Dashboards reflect stored data; data stays consistent
    const b = await loadAll();
    const dA = smeDashboard(b, A.smeId!), dB = smeDashboard(b, B.smeId!);
    expect(dA.kpis.find((k) => k.key === "approved")!.value).toBe(1); expect(dB.kpis.find((k) => k.key === "pending")!.value).toBe(1);
    expect(dB.actions.some((a) => a.urgent && /Check the centre city/.test(a.text))).toBe(true);
    const admin = adminDashboard(b, {});
    expect(admin.kpis.find((k) => k.key === "ver")!.value).toBe(1); expect(admin.kpis.find((k) => k.key === "cr")!.value).toBe(1); expect(admin.kpis.find((k) => k.key === "rpaid")!.value).toBe(1);
    expect(checkIntegrity(b)).toEqual([]);

    // 10. Audit log captured the sensitive steps with actors
    const actions = (await rows("Audit_Log")).map((x) => x.action);
    expect(actions).toEqual(expect.arrayContaining(["sme.create", "assignment.create", "application.submit", "document.upload", "application.verify", "reimbursement.record_payment", "admit.verify", "travel.update", "job.reminders"]));
  });
});
