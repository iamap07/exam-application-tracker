import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, query, readAll, type Row } from "@/lib/sheets/store";
import { AuthError, assertOwnership, type Session } from "@/lib/auth/session";
import { canViewFinancial } from "@/lib/auth/permissions";
import { HttpError } from "@/lib/http";
import { parseWindows } from "@/lib/readiness";

export async function ownAssignment(s: Session, id: string): Promise<Row> {
  const a = await findById(SHEETS.Exam_Assignments, id);
  if (!a) throw new HttpError(404, "Assignment not found.");
  assertOwnership(s, a);
  if (a.assignment_status !== "Active") throw new HttpError(409, "This assignment is no longer active.");
  return a;
}
export async function anyAssignment(id: string): Promise<Row> {
  const a = await findById(SHEETS.Exam_Assignments, id);
  if (!a) throw new HttpError(404, "Assignment not found.");
  return a;
}
export async function liveDocs(assignmentId: string, type?: string): Promise<Row[]> {
  return (await query(SHEETS.Document_Registry, (d) => d.assignment_id === assignmentId && !["Superseded", "Rejected"].includes(d.verification_status) && (!type || d.doc_type === type)))
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
}
export async function requireFinancial(s: Session) {
  if (!(await canViewFinancial(s))) throw new AuthError(403, "Reimbursement details are restricted. Ask a Super Admin for access.");
}
export async function getPolicy() {
  const { rows } = await readAll(SHEETS.System_Config);
  const g = (k: string) => rows.find((r) => r.key === k)?.value;
  return { windows: parseWindows(g("readiness_windows")), overdueDays: Math.min(180, Math.max(1, Number(g("reimb_overdue_days")) || 30)) };
}
