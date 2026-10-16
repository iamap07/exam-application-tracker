import { describe, expect, it } from "vitest";
import { saveOwnApplication, reviewApplication } from "@/lib/services/applications";
import { acknowledge } from "@/lib/services/assignments";
import { adminDashboard, loadAll, smeDashboard } from "@/lib/services/dashboard";
import { uploadDocument } from "@/lib/services/documents";
import { ADMIN, assignOne, key, pdfFile, rows, seedExam, seedSme, smeSession } from "./helpers";

const FULL = { registration_no: "R", applied_post: "L", centre_city: "D", amount_paid: "1000", payment_mode: "UPI", submit: true };
const kpi = (d: { kpis: { key: string; value: number }[] }, k: string) => d.kpis.find((x) => x.key === k)!.value;

async function world() {
  const a = await seedSme("A", "Alice", "Physics"), b = await seedSme("B", "Bob", "Chemistry");
  const exam = await seedExam(); const aAsg = await assignOne(exam.exam_id, "A"); const bAsg = await assignOne(exam.exam_id, "B");
  return { A: smeSession(a), B: smeSession(b), exam, aAsg, bAsg };
}

describe("dashboards are computed from stored data", () => {
  it("SME dashboard counts only that SME's own records and updates as data changes", async () => {
    const { A, B, aAsg } = await world();
    let d = smeDashboard(await loadAll(), "A"); expect(kpi(d, "assigned")).toBe(1); expect(kpi(d, "pending")).toBe(1); expect(kpi(d, "submitted")).toBe(0);
    await saveOwnApplication(A, aAsg, FULL);
    d = smeDashboard(await loadAll(), "A"); expect(kpi(d, "pending")).toBe(0); expect(kpi(d, "submitted")).toBe(1);
    const other = smeDashboard(await loadAll(), "B"); expect(kpi(other, "submitted")).toBe(0); expect(kpi(other, "pending")).toBe(1);
    void B;
  });
  it("lists pending actions that disappear once done, and surfaces corrections as urgent", async () => {
    const { A, aAsg } = await world();
    let d = smeDashboard(await loadAll(), "A"); expect(d.actions.map((x) => x.text).join("|")).toMatch(/Acknowledge/); expect(d.actions.map((x) => x.text).join("|")).toMatch(/Start your application/);
    await acknowledge(A, aAsg); await saveOwnApplication(A, aAsg, FULL);
    d = smeDashboard(await loadAll(), "A"); expect(d.actions.some((x) => /Acknowledge|Start your application/.test(x.text))).toBe(false);
    expect(d.actions.some((x) => /application form/.test(x.text))).toBe(true); // submitted but no form uploaded
    const app = (await rows("Application_Responses")).find((x) => x.sme_id === "A")!;
    await reviewApplication(ADMIN, app.application_id, "request_correction", "Fix city");
    d = smeDashboard(await loadAll(), "A"); expect(d.actions[0]).toMatchObject({ urgent: true }); expect(d.actions[0].text).toContain("Fix city");
  });
  it("admin dashboard totals, status counts, missing-documents and filters", async () => {
    const { A, aAsg, exam } = await world(); const exam2 = await seedExam({ name: "Other" }); await assignOne(exam2.exam_id, "A");
    let d = adminDashboard(await loadAll(), {});
    expect(kpi(d, "smes")).toBe(2); expect(kpi(d, "active")).toBe(2); expect(kpi(d, "exams")).toBe(2); expect(kpi(d, "asg")).toBe(3); expect(kpi(d, "ns")).toBe(3);
    await saveOwnApplication(A, aAsg, FULL);
    d = adminDashboard(await loadAll(), {}); expect(kpi(d, "sub")).toBe(1); expect(kpi(d, "ns")).toBe(2); expect(kpi(d, "missdocs")).toBe(1);
    await uploadDocument(A, { assignmentId: aAsg, docType: "application_form", uploadKey: key(), file: pdfFile() });
    await uploadDocument(A, { assignmentId: aAsg, docType: "payment_receipt", uploadKey: key(), file: pdfFile() });
    d = adminDashboard(await loadAll(), {}); expect(kpi(d, "missdocs")).toBe(0);
    expect(kpi(adminDashboard(await loadAll(), { exam_id: exam.exam_id }), "asg")).toBe(2);
    expect(kpi(adminDashboard(await loadAll(), { department: "Chemistry" }), "asg")).toBe(1);
    expect(d.byExam.find((x) => x.label === "JEE Main")).toMatchObject({ value: 50, detail: "1/2" });
  });
  it("revoked assignments drop out of the counts", async () => {
    const { aAsg } = await world(); const { revokeAssignment } = await import("@/lib/services/assignments");
    await revokeAssignment(ADMIN, aAsg, "No longer needed");
    expect(kpi(adminDashboard(await loadAll(), {}), "asg")).toBe(1); expect(kpi(smeDashboard(await loadAll(), "A"), "assigned")).toBe(0);
  });
});
