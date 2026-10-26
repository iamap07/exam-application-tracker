import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, insert, updateById, type Row } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import type { Session } from "@/lib/auth/session";
import { examInput } from "@/lib/validation";
import { HttpError } from "@/lib/http";

const EXAM = SHEETS.Exam_Master;

export async function createExam(actor: Session, raw: unknown) {
  const { exam_id, ...rest } = examInput.parse(raw);
  const row = await insert(EXAM, { ...(rest as Record<string, string>), exam_id: exam_id ?? newId("EXAM"), created_by: actor.email, updated_by: actor.email });
  await audit(actor, "exam.create", "EXAM", row.exam_id, "success", undefined, { name: row.name, status: row.status });
  return row;
}

export async function updateExam(actor: Session, examId: string, raw: unknown, expectedUpdatedAt?: string) {
  const before = await findById(EXAM, examId);
  if (!before) throw new HttpError(404, "Examination not found.");
  const { exam_id: _ignored, ...patch } = examInput.parse({ ...before, ...(raw as object), exam_id: undefined });
  const after = await updateById(EXAM, examId, patch as Record<string, string>, { actor: actor.email, expectedUpdatedAt });
  // Full before/after is kept in the audit log so exam changes never lose history.
  await audit(actor, "exam.update", "EXAM", examId, "success", before, after);
  return after;
}
export type { Row };
