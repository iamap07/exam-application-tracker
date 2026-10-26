import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { DuplicateError, findById, insert, readAll, updateById, type Row } from "@/lib/sheets/store";
import { createFolder, findByProp, folderExists, parentFolderId, type DriveItem } from "@/lib/google/drive";
import { SUBFOLDERS, normalizeName } from "@/lib/files";
import { HttpError } from "@/lib/http";

const MAP = SHEETS.Drive_Folder_Map;

// Serialise work per folder key within an instance. Across instances, the Drive appProperties lookup prevents duplicates.
const chains = new Map<string, Promise<unknown>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (chains.get(key) ?? Promise.resolve()).catch(() => undefined).then(fn);
  chains.set(key, next);
  return next;
}

interface Spec { key: string; kind: "root" | "sme" | "exam"; parent: string; name: string; sme_id?: string; exam_id?: string; assignment_id?: string; actor: string }

async function ensureFolder(spec: Spec, existing: Row | undefined): Promise<DriveItem & { row: Row }> {
  return once(spec.key, async () => {
    if (existing?.folder_id && (await folderExists(existing.folder_id))) return { id: existing.folder_id, url: existing.folder_url, row: existing };
    const item = (await findByProp(spec.parent, "eat_key", spec.key)) ?? (await createFolder(spec.parent, spec.name, spec.key));
    const fields = { kind: spec.kind, sme_id: spec.sme_id ?? "", exam_id: spec.exam_id ?? "", assignment_id: spec.assignment_id ?? "", folder_id: item.id, folder_url: item.url };
    let row: Row;
    if (existing) row = await updateById(MAP, spec.key, { ...fields, subfolder_ids_json: "" }, { actor: spec.actor });
    else {
      try { row = await insert(MAP, { folder_key: spec.key, ...fields, created_by: spec.actor, updated_by: spec.actor }); }
      catch (e) { if (!(e instanceof DuplicateError)) throw e; row = (await findById(MAP, spec.key))!; }
    }
    return { ...item, row };
  });
}

export interface AssignmentFolders { examFolderId: string; examFolderUrl: string; subfolders: Record<string, string> }

/** Creates or reuses Parent/SMEs/<SME_ID_Name>/Exam_<ExamID>_<Name>/ with the 7 subfolders. Safe to call repeatedly. */
export async function ensureAssignmentFolders(assignmentId: string, actor: string, opts: { refresh?: boolean } = {}): Promise<AssignmentFolders> {
  const asg = await findById(SHEETS.Exam_Assignments, assignmentId);
  if (!asg) throw new HttpError(404, "Assignment not found.");
  const [sme, exam, { rows: mapRows }] = await Promise.all([findById(SHEETS.SME_Master, asg.sme_id), findById(SHEETS.Exam_Master, asg.exam_id), readAll(MAP)]);
  if (!sme || !exam) throw new HttpError(404, "SME or examination not found.");
  const by = (k: string) => mapRows.find((r) => r.folder_key === k);

  const root = await ensureFolder({ key: "root:SMEs", kind: "root", parent: parentFolderId(), name: "SMEs", actor }, by("root:SMEs"));
  const smeF = await ensureFolder({ key: `sme:${sme.sme_id}`, kind: "sme", parent: root.id, name: `${sme.sme_id}_${normalizeName(sme.full_name)}`, sme_id: sme.sme_id, actor }, by(`sme:${sme.sme_id}`));
  const examF = await ensureFolder({ key: `exam:${assignmentId}`, kind: "exam", parent: smeF.id, name: `Exam_${normalizeName(exam.exam_id, 40)}_${normalizeName(exam.name)}`, sme_id: sme.sme_id, exam_id: exam.exam_id, assignment_id: assignmentId, actor }, by(`exam:${assignmentId}`));

  let subs: Record<string, string> = {};
  try { subs = opts.refresh ? {} : JSON.parse(examF.row.subfolder_ids_json || "{}"); } catch { subs = {}; }
  let changed = false;
  for (const name of SUBFOLDERS) {
    if (subs[name]) continue;
    const key = `sub:${assignmentId}:${name}`;
    const item = (await findByProp(examF.id, "eat_key", key)) ?? (await createFolder(examF.id, name, key));
    subs[name] = item.id; changed = true;
  }
  if (changed || opts.refresh) await updateById(MAP, `exam:${assignmentId}`, { subfolder_ids_json: JSON.stringify(subs) }, { actor });
  return { examFolderId: examF.id, examFolderUrl: examF.url, subfolders: subs };
}
