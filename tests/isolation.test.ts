// Cross-SME isolation: SME A must be refused on every record that belongs to SME B (server-side).
import { describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/session";
import { getOwnApplication, saveOwnApplication } from "@/lib/services/applications";
import { acknowledge } from "@/lib/services/assignments";
import { fetchDocument, uploadDocument } from "@/lib/services/documents";
import { saveClaim } from "@/lib/services/reimbursements";
import { saveAdmitDetails } from "@/lib/services/admit";
import { confirmTravel } from "@/lib/services/travel";
import { updateOwnProfile } from "@/lib/services/smes";
import { assignOne, key, pdfFile, seedExam, seedSme, smeSession } from "./helpers";

async function twoSmes() {
  const a = await seedSme("SME-A", "Alice"), b = await seedSme("SME-B", "Bob");
  const exam = await seedExam();
  const aAsg = await assignOne(exam.exam_id, "SME-A"), bAsg = await assignOne(exam.exam_id, "SME-B");
  const A = smeSession(a), B = smeSession(b);
  const doc = (await uploadDocument(B, { assignmentId: bAsg, docType: "application_form", uploadKey: key(), file: pdfFile() })).document;
  return { A, B, aAsg, bAsg, doc };
}
const forbidden = { status: 403 };

describe("cross-SME isolation (server-side)", () => {
  it("cannot read or edit another SME's application", async () => {
    const { A, bAsg } = await twoSmes();
    await expect(getOwnApplication(A, bAsg)).rejects.toBeInstanceOf(AuthError);
    await expect(saveOwnApplication(A, bAsg, { registration_no: "X" })).rejects.toMatchObject(forbidden);
  });
  it("cannot download another SME's document by id", async () => {
    const { A, B, doc } = await twoSmes();
    await expect(fetchDocument(A, doc.document_id)).rejects.toMatchObject(forbidden);
    await expect(fetchDocument(B, doc.document_id)).resolves.toBeTruthy();
  });
  it("cannot upload into another SME's assignment folder", async () => {
    const { A, bAsg } = await twoSmes();
    await expect(uploadDocument(A, { assignmentId: bAsg, docType: "other", uploadKey: key(), file: pdfFile() })).rejects.toMatchObject(forbidden);
  });
  it("cannot replace another SME's document", async () => {
    const { A, aAsg, doc } = await twoSmes();
    await expect(uploadDocument(A, { assignmentId: aAsg, docType: "application_form", uploadKey: key(), replaceDocumentId: doc.document_id, file: pdfFile() })).rejects.toThrow(/not found/i);
  });
  it("cannot acknowledge, claim reimbursement, confirm admit details or travel for another SME", async () => {
    const { A, bAsg } = await twoSmes();
    await expect(acknowledge(A, bAsg)).rejects.toMatchObject(forbidden);
    await expect(saveClaim(A, bAsg, { claimed_amount: "100" })).rejects.toMatchObject(forbidden);
    await expect(saveAdmitDetails(A, bAsg, { city: "Delhi" })).rejects.toMatchObject(forbidden);
    await expect(confirmTravel(A, bAsg)).rejects.toMatchObject(forbidden);
  });
  it("a client-supplied SME id in the payload is ignored", async () => {
    const { A, aAsg } = await twoSmes();
    const out = await saveOwnApplication(A, aAsg, { registration_no: "R1", sme_id: "SME-B" } as never);
    expect(out.application.sme_id).toBe("SME-A");
  });
  it("SMEs cannot change admin-controlled profile fields", async () => {
    const { A } = await twoSmes();
    await expect(updateOwnProfile(A, { department: "Hacked" })).rejects.toThrow();
    const after = await updateOwnProfile(A, { mobile: "9123456789" });
    expect(after.mobile).toBe("9123456789"); expect(after.emergency_contact).toBe("Parent 9999999999"); // unrelated field untouched
  });
  it("SMEs cannot upload admin-only document types", async () => {
    const { A, aAsg } = await twoSmes();
    await expect(uploadDocument(A, { assignmentId: aAsg, docType: "travel_accommodation", uploadKey: key(), file: pdfFile() })).rejects.toMatchObject(forbidden);
  });
});
