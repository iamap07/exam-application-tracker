import { SHEETS } from "@/lib/sheets/schema";
import { insert, readAll, type Row } from "@/lib/sheets/store";
import { createExam } from "@/lib/services/exams";
import { assign } from "@/lib/services/assignments";
import type { Session } from "@/lib/auth/session";
import { todayIST } from "@/lib/dates";

export const ADMIN: Session = { userId: "u-admin", email: "admin@x.test", role: "super_admin" };
export const OPS: Session = { userId: "u-ops", email: "ops@x.test", role: "ops_admin" };
export const today = () => todayIST();
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

export function seedSme(id: string, name = id, department = "Physics", status = "Active") {
  return insert(SHEETS.SME_Master, { sme_id: id, auth_user_id: `auth-${id}`, full_name: name, email: `${id.toLowerCase()}@x.test`, department, subjects: "Physics", designation: "Lecturer", mobile: "9876543210", emergency_contact: "Parent 9999999999", employee_id: `E-${id}`, account_status: status, profile_complete: "Yes", created_by: "test", updated_by: "test" });
}
export const smeSession = (sme: Row): Session => ({ userId: sme.auth_user_id, email: sme.email, role: "sme", smeId: sme.sme_id });

export function seedExam(over: Record<string, unknown> = {}) {
  return createExam(ADMIN, { name: "JEE Main", organization: "NTA", status: "Open", application_deadline: addDays(today(), 10), exam_date: addDays(today(), 30), fee: "1000", reimbursement_eligible: "Yes", travel_eligible: "Yes", accommodation_eligible: "Yes", ...over });
}
export async function assignOne(examId: string, smeId: string) {
  const r = await assign(ADMIN, { exam_id: examId, mode: "single", sme_ids: [smeId] });
  if (r.summary.failed) throw new Error("assign failed: " + JSON.stringify(r.results));
  return asgId(examId, smeId);
}
export async function asgId(examId: string, smeId: string) {
  const a = (await readAll(SHEETS.Exam_Assignments)).rows.find((x) => x.exam_id === examId && x.sme_id === smeId);
  if (!a) throw new Error("no assignment"); return a.assignment_id;
}
export const rows = async (name: keyof typeof SHEETS) => (await readAll(SHEETS[name])).rows;

const PDF = Buffer.from("%PDF-1.4\n%test document content\n1 0 obj\n<<>>\nendobj\n");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
export const pdfFile = (name = "doc.pdf") => new File([PDF], name, { type: "application/pdf" });
export const pngFile = (name = "pic.png") => new File([PNG], name, { type: "image/png" });
export const fakeExe = () => new File([Buffer.from("MZ\x90\x00 not allowed")], "run.exe", { type: "application/pdf" });
let n = 0; export const key = () => `key-${Date.now()}-${++n}-abcdefghij`;

export async function errOf(p: Promise<unknown>): Promise<any> { try { await p; } catch (e) { return e; } throw new Error("expected the promise to reject"); }
import { sheetsState } from "./fakes/state";
/** Directly edit a stored cell (to simulate time passing or crashed runs). */
export function setRaw(tab: string, idCol: string, id: string, col: string, value: string) {
  const t = sheetsState.tabs.get(tab)!; const h = t[0]; const ci = h.indexOf(col), ii = h.indexOf(idCol);
  const row = t.find((r, i) => i > 0 && r[ii] === id)!; while (row.length <= ci) row.push(""); row[ci] = value;
}
