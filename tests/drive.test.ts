import { describe, expect, it } from "vitest";
import { ensureAssignmentFolders } from "@/lib/services/drive-folders";
import { fetchDocument, getUploadPolicy, reviewDocument, uploadDocument } from "@/lib/services/documents";
import { SHEETS } from "@/lib/sheets/schema";
import { setConfig } from "@/lib/sheets/store";
import { driveState, sheetsState } from "./fakes/state";
import { ADMIN, assignOne, errOf, fakeExe, key, pdfFile, pngFile, rows, seedExam, seedSme, smeSession } from "./helpers";

const folders = () => driveState.items.filter((i) => i.isFolder);
const files = () => driveState.items.filter((i) => !i.isFolder);
const noDuplicateFolders = () => { const seen = new Set<string>(); for (const f of folders()) { const k = `${f.parent}/${f.name}`; if (seen.has(k)) return false; seen.add(k); } return true; };
async function setup() { const sme = await seedSme("SME-1", "Ravi Kumar / Jr."); const exam = await seedExam({ name: "UGC NET (Dec)" }); const asg = await assignOne(exam.exam_id, "SME-1"); return { sme, S: smeSession(sme), exam, asg }; }

describe("Drive folder structure", () => {
  it("creates Parent/SMEs/<SME_ID_Name>/Exam_<ID>_<Name>/ with the 7 numbered subfolders (names normalised)", async () => {
    const { exam, asg } = await setup();
    const byName = (n: string) => folders().find((f) => f.name === n)!;
    const smes = byName("SMEs"); expect(smes.parent).toBe("ROOT");
    const smeF = folders().find((f) => f.parent === smes.id)!; expect(smeF.name).toBe("SME-1_Ravi_Kumar_Jr.");
    const examF = folders().find((f) => f.parent === smeF.id)!; expect(examF.name).toBe(`Exam_${exam.exam_id}_UGC_NET_Dec`);
    expect(folders().filter((f) => f.parent === examF.id).map((f) => f.name).sort()).toEqual(["01_Application_Form", "02_Payment_Receipt", "03_Admit_Card", "04_Reimbursement", "05_Exam_Communication", "06_Travel_Accommodation", "07_Other_Documents"]);
    const map = (await rows("Drive_Folder_Map")).find((m) => m.folder_key === `exam:${asg}`)!;
    expect(map.folder_id).toBe(examF.id); expect(map.folder_url).toContain(examF.id);
  });
  it("reuses existing folders on repeated calls (no duplicates)", async () => {
    const { asg } = await setup(); const before = folders().length;
    const a = await ensureAssignmentFolders(asg, "t"), b = await ensureAssignmentFolders(asg, "t"), c = await ensureAssignmentFolders(asg, "t", { refresh: true });
    expect(b.examFolderId).toBe(a.examFolderId); expect(c.examFolderId).toBe(a.examFolderId); expect(folders().length).toBe(before);
  });
  it("shares one SME folder across that SME's exams and gives each exam its own folder", async () => {
    const { exam } = await setup(); const exam2 = await seedExam({ name: "CSIR NET" }); await assignOne(exam2.exam_id, "SME-1");
    expect(folders().filter((f) => f.name.startsWith("SME-1_"))).toHaveLength(1);
    expect(folders().filter((f) => f.name.startsWith("Exam_"))).toHaveLength(2); void exam;
  });
  it("after losing the Sheets map, finds the existing Drive folders instead of creating duplicates", async () => {
    const { asg } = await setup(); const before = folders().length;
    sheetsState.tabs.get("Drive_Folder_Map")!.length = 1; // keep header only
    await ensureAssignmentFolders(asg, "t");
    expect(folders().length).toBe(before); expect(noDuplicateFolders()).toBe(true);
    expect((await rows("Drive_Folder_Map")).length).toBeGreaterThan(0);
  });
  it("a failed Sheets write mid-way leaves no duplicates after the retry", async () => {
    await seedSme("SME-1", "Ravi"); const exam = await seedExam(); const { assign } = await import("@/lib/services/assignments");
    sheetsState.failAppend = { tab: "Drive_Folder_Map", times: 1 };
    const r = await assign(ADMIN, { exam_id: exam.exam_id, mode: "single", sme_ids: ["SME-1"] });
    expect(r.summary.folderFailures).toBe(1);
    const asg = (await rows("Exam_Assignments"))[0].assignment_id;
    await ensureAssignmentFolders(asg, "t");
    expect(noDuplicateFolders()).toBe(true); expect(folders().filter((f) => f.name === "SMEs")).toHaveLength(1);
  });
});

describe("uploads", () => {
  it("stores the file in the right category folder and registers it as Pending (never auto-verified)", async () => {
    const { S, asg, sme } = await setup();
    const { document: d } = await uploadDocument(S, { assignmentId: asg, docType: "admit_card", uploadKey: key(), file: pdfFile("My Admit (1).pdf") });
    const f = driveState.items.find((i) => i.id === d.drive_file_id)!;
    expect(driveState.items.find((i) => i.id === f.parent)!.name).toBe("03_Admit_Card");
    expect(d).toMatchObject({ sme_id: sme.sme_id, doc_type: "admit_card", verification_status: "Pending", uploaded_by: S.email, mime_type: "application/pdf", verified_by: "" });
    expect(d.drive_url).toContain(d.drive_file_id); expect(f.name).toMatch(/^admit_card_/); expect(f.name).not.toContain("(");
  });
  it("rejects disallowed, mislabelled, empty and oversized files, and stores nothing", async () => {
    const { S, asg } = await setup(); const up = (file: File) => uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: key(), file });
    await expect(up(fakeExe())).rejects.toMatchObject({ status: 400 });
    await expect(up(new File([Buffer.from("%PDF-1.4\n%x.................")], "a.png", { type: "image/png" }))).rejects.toMatchObject({ status: 400 });
    await expect(up(new File([], "e.pdf", { type: "application/pdf" }))).rejects.toMatchObject({ status: 400 });
    await expect(up(new File([Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(5 * 1024 * 1024)])], "big.pdf", { type: "application/pdf" }))).rejects.toThrow(/limit/);
    expect(files()).toHaveLength(0); expect(await rows("Document_Registry")).toHaveLength(0);
  });
  it("honours admin policy: optional types are off until enabled; size can be lowered", async () => {
    const { S, asg } = await setup(); const webp = new File([Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(8)])], "a.webp", { type: "image/webp" });
    await expect(uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: key(), file: webp })).rejects.toThrow(/not allowed/);
    await setConfig("extra_types", "webp", "t");
    await expect(uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: key(), file: webp })).resolves.toBeTruthy();
    await setConfig("max_upload_mb", "1", "t"); expect((await getUploadPolicy()).maxMb).toBe(1);
  });
  it("is retry-safe: the same upload key never creates a second file or record", async () => {
    const { S, asg } = await setup(); const k = key();
    const a = await uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: k, file: pdfFile() });
    const b = await uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: k, file: pdfFile() });
    expect(a.replayed).toBe(false); expect(b.replayed).toBe(true); expect(b.document.document_id).toBe(a.document.document_id);
    expect(files()).toHaveLength(1); expect(await rows("Document_Registry")).toHaveLength(1);
  });
  it("if Drive succeeds but the registry write fails, the orphan file is removed and no success is reported", async () => {
    const { S, asg } = await setup();
    sheetsState.failAppend = { tab: "Document_Registry", times: 1 };
    const e = await errOf(uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: key(), file: pdfFile() }));
    expect(e.status).toBe(502); expect(files()).toHaveLength(0); expect(await rows("Document_Registry")).toHaveLength(0);
  });
  it("if Drive fails, nothing is recorded and a retry with the same key works", async () => {
    const { S, asg } = await setup(); const k = key(); driveState.failUpload = 1;
    await expect(uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: k, file: pdfFile() })).rejects.toMatchObject({ status: 502 });
    expect(await rows("Document_Registry")).toHaveLength(0);
    await expect(uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: k, file: pdfFile() })).resolves.toBeTruthy();
    expect(files()).toHaveLength(1);
  });
  it("rebuilds a deleted category folder and still uploads", async () => {
    const { S, asg } = await setup();
    driveState.items.find((i) => i.name === "02_Payment_Receipt")!.trashed = true;
    const { document: d } = await uploadDocument(S, { assignmentId: asg, docType: "payment_receipt", uploadKey: key(), file: pngFile() });
    const parent = driveState.items.find((i) => i.id === driveState.items.find((x) => x.id === d.drive_file_id)!.parent)!;
    expect(parent.name).toBe("02_Payment_Receipt"); expect(parent.trashed).toBe(false);
  });
});

describe("replace, review and download", () => {
  it("replacing keeps history: the old record becomes Superseded and points to the new one", async () => {
    const { S, asg } = await setup();
    const a = (await uploadDocument(S, { assignmentId: asg, docType: "payment_receipt", uploadKey: key(), file: pdfFile() })).document;
    const b = (await uploadDocument(S, { assignmentId: asg, docType: "payment_receipt", uploadKey: key(), replaceDocumentId: a.document_id, file: pngFile() })).document;
    const all = await rows("Document_Registry"); expect(all).toHaveLength(2);
    expect(all.find((x) => x.document_id === a.document_id)).toMatchObject({ verification_status: "Superseded", replaced_by: b.document_id });
    await expect(uploadDocument(S, { assignmentId: asg, docType: "admit_card", uploadKey: key(), replaceDocumentId: b.document_id, file: pdfFile() })).rejects.toThrow(/same document type/);
  });
  it("an SME cannot replace a verified document; an admin must reopen it first", async () => {
    const { S, asg } = await setup();
    const a = (await uploadDocument(S, { assignmentId: asg, docType: "payment_receipt", uploadKey: key(), file: pdfFile() })).document;
    await reviewDocument(ADMIN, a.document_id, "verify", "");
    await expect(uploadDocument(S, { assignmentId: asg, docType: "payment_receipt", uploadKey: key(), replaceDocumentId: a.document_id, file: pdfFile() })).rejects.toMatchObject({ status: 409 });
    await reviewDocument(ADMIN, a.document_id, "request_correction", "Blurry");
    await expect(uploadDocument(S, { assignmentId: asg, docType: "payment_receipt", uploadKey: key(), replaceDocumentId: a.document_id, file: pdfFile() })).resolves.toBeTruthy();
  });
  it("review needs a reason for correction/rejection and notifies the SME", async () => {
    const { S, asg } = await setup();
    const a = (await uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: key(), file: pdfFile() })).document;
    await expect(reviewDocument(ADMIN, a.document_id, "reject", "")).rejects.toMatchObject({ status: 400 });
    const r = await reviewDocument(ADMIN, a.document_id, "reject", "Not legible");
    expect(r).toMatchObject({ verification_status: "Rejected", verified_by: ADMIN.email, admin_remarks: "Not legible" });
    expect((await rows("Notifications")).some((n) => n.type === "document_review")).toBe(true);
  });
  it("serves the stored bytes to the owner and to admins, and audits admin downloads", async () => {
    const { S, asg } = await setup();
    const a = (await uploadDocument(S, { assignmentId: asg, docType: "other", uploadKey: key(), file: pdfFile() })).document;
    const own = await fetchDocument(S, a.document_id), adm = await fetchDocument(ADMIN, a.document_id);
    expect(own.bytes.toString().startsWith("%PDF-")).toBe(true); expect(adm.bytes.length).toBe(own.bytes.length);
    expect((await rows("Audit_Log")).some((x) => x.action === "document.download")).toBe(true);
    await expect(fetchDocument(S, "DOC-NOPE")).rejects.toMatchObject({ status: 404 });
  });
});
void SHEETS;
