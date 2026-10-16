import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { DuplicateError, findById, insert, readAll, updateById, type Row } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { notifySme } from "@/lib/notifications";
import { assertOwnership, type Session } from "@/lib/auth/session";
import { HttpError, safeMessage } from "@/lib/http";
import { DEFAULT_ALLOWED, DOC_TYPES, HARD_MAX_BYTES, OPTIONAL_TYPES, DocType, isDocType, sanitizeFileName, validateUpload } from "@/lib/files";
import { deleteFile, downloadFile, uploadFile } from "@/lib/google/drive";
import { ensureAssignmentFolders } from "./drive-folders";
import { syncAdmitDocument } from "./admit";

const DOC = SHEETS.Document_Registry, ASG = SHEETS.Exam_Assignments;

export async function getUploadPolicy() {
  const { rows } = await readAll(SHEETS.System_Config);
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const mb = Math.min(4, Math.max(1, Number(get("max_upload_mb")) || 4));
  const extras = (get("extra_types") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter((s) => OPTIONAL_TYPES.includes(s));
  return { maxBytes: Math.min(mb * 1048576, HARD_MAX_BYTES), maxMb: mb, allowed: [...DEFAULT_ALLOWED, ...extras] };
}

export interface UploadInput { assignmentId: string; docType: string; uploadKey: string; replaceDocumentId?: string; file: File }

export async function uploadDocument(actor: Session, i: UploadInput) {
  if (!isDocType(i.docType)) throw new HttpError(400, "Choose a document type.");
  const docType: DocType = i.docType;
  if (!/^[A-Za-z0-9-]{16,64}$/.test(i.uploadKey)) throw new HttpError(400, "Missing upload key. Reload the page and try again.");
  const asg = await findById(ASG, i.assignmentId);
  if (!asg) throw new HttpError(404, "Assignment not found.");
  assertOwnership(actor, asg);
  if (asg.assignment_status !== "Active") throw new HttpError(409, "This assignment is no longer active.");
  if (actor.role === "sme" && !DOC_TYPES[docType].smeCanUpload) throw new HttpError(403, "Only administrators can upload this document type.");

  // Idempotency: scope the key to the (ownership-checked) assignment so keys can never reach another SME's records.
  const scopedKey = `${i.assignmentId}:${i.uploadKey}`;
  const { rows: docs } = await readAll(DOC);
  const prior = docs.find((d) => d.upload_key === scopedKey);
  if (prior) return { document: prior, replayed: true as const };

  let old: Row | undefined;
  if (i.replaceDocumentId) {
    old = docs.find((d) => d.document_id === i.replaceDocumentId);
    if (!old || old.assignment_id !== i.assignmentId) throw new HttpError(404, "The document to replace was not found.");
    if (old.doc_type !== docType) throw new HttpError(400, "A replacement must be the same document type.");
    if (old.verification_status === "Superseded") throw new HttpError(409, "That document was already replaced.");
    if (actor.role === "sme" && old.verification_status === "Verified") throw new HttpError(409, "Verified documents can only be replaced after an administrator reopens them.");
  }

  const bytes = new Uint8Array(await i.file.arrayBuffer());
  const policy = await getUploadPolicy();
  const v = validateUpload({ name: i.file.name, declaredMime: i.file.type, bytes, allowed: policy.allowed, maxBytes: policy.maxBytes });
  if (!v.ok) throw new HttpError(400, v.error);

  let folders = await ensureAssignmentFolders(i.assignmentId, actor.email);
  const driveName = `${docType}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}_${sanitizeFileName(i.file.name)}`;
  const target = () => folders.subfolders[DOC_TYPES[docType].folder];
  let item;
  try { item = await uploadFile(target(), driveName, v.mime, Buffer.from(bytes), scopedKey); }
  catch (e) {
    if ((e as { response?: { status?: number } }).response?.status !== 404) throw new HttpError(502, "The file could not be stored in Drive. Nothing was saved; please try again.");
    folders = await ensureAssignmentFolders(i.assignmentId, actor.email, { refresh: true }); // folder was deleted/moved: rebuild once
    try { item = await uploadFile(target(), driveName, v.mime, Buffer.from(bytes), scopedKey); }
    catch { throw new HttpError(502, "The file could not be stored in Drive. Nothing was saved; please try again."); }
  }

  let doc: Row;
  try {
    doc = await insert(DOC, { document_id: newId("DOC"), assignment_id: i.assignmentId, sme_id: asg.sme_id, exam_id: asg.exam_id, doc_type: docType, file_name: sanitizeFileName(i.file.name), mime_type: v.mime, size_bytes: String(bytes.length), drive_file_id: item.id, drive_url: item.url, uploaded_by: actor.email, uploaded_at: new Date().toISOString(), verification_status: "Pending", upload_key: scopedKey, created_by: actor.email, updated_by: actor.email });
  } catch (e) {
    if (e instanceof DuplicateError) { const again = (await readAll(DOC)).rows.find((d) => d.upload_key === scopedKey); if (again) return { document: again, replayed: true as const }; }
    // The file is in Drive but not registered: remove it so no orphan is left, and never report success.
    if (item.created) await deleteFile(item.id).catch((err) => console.error("orphan cleanup failed", item.id, safeMessage(err)));
    await audit(actor, "document.upload", "DOCUMENT", i.assignmentId, "failure", undefined, { error: safeMessage(e) });
    throw new HttpError(502, "The file was uploaded but could not be recorded, so it was discarded. Please try again.");
  }

  let warning: string | undefined;
  if (old) {
    try { await updateById(DOC, old.document_id, { verification_status: "Superseded", replaced_by: doc.document_id }, { actor: actor.email }); }
    catch { warning = "Your new file is saved, but the old one could not be marked as replaced. An administrator can fix this."; }
  }
  if (docType === "admit_card") { try { await syncAdmitDocument(asg, actor.email); } catch (e) { warning = (warning ? warning + " " : "") + "Uploaded, but the admit card record could not be refreshed. It will refresh when you save your exam details."; console.error("admit sync failed", safeMessage(e)); } }
  await audit(actor, old ? "document.replace" : "document.upload", "DOCUMENT", doc.document_id, "success", old, { doc_type: docType, file: doc.file_name, drive_file_id: doc.drive_file_id });
  return { document: doc, replayed: false as const, warning };
}

/** Authorises (SME: own records only; admins: all) and returns the bytes. */
export async function fetchDocument(actor: Session, documentId: string) {
  const d = await findById(DOC, documentId);
  if (!d) throw new HttpError(404, "Document not found.");
  assertOwnership(actor, d);
  let bytes: Buffer;
  try { bytes = await downloadFile(d.drive_file_id); } catch { throw new HttpError(502, "The file could not be retrieved from Drive right now."); }
  if (actor.role !== "sme") await audit(actor, "document.download", "DOCUMENT", documentId, "success");
  return { doc: d, bytes };
}

export async function reviewDocument(actor: Session, documentId: string, action: "verify" | "request_correction" | "reject", reason: string) {
  const d = await findById(DOC, documentId);
  if (!d) throw new HttpError(404, "Document not found.");
  if (d.verification_status === "Superseded") throw new HttpError(409, "This document was replaced; review the newer one.");
  if (action !== "verify" && !reason.trim()) throw new HttpError(400, "Enter a reason. The SME will see it.");
  const status = action === "verify" ? "Verified" : action === "reject" ? "Rejected" : "Correction Required";
  const after = await updateById(DOC, documentId, { verification_status: status, verified_by: actor.email, verified_at: new Date().toISOString(), admin_remarks: action === "verify" ? "" : reason.trim().slice(0, 500) }, { actor: actor.email, expectedUpdatedAt: d.updated_at });
  await audit(actor, `document.${action}`, "DOCUMENT", documentId, "success", { status: d.verification_status }, { status });
  await notifySme({ smeId: d.sme_id, examId: d.exam_id, type: "document_review", key: `docreview:${documentId}:${action}:${after.updated_at}`, actor: actor.email, subject: `Document ${status.toLowerCase()}: ${DOC_TYPES[d.doc_type as DocType]?.label ?? d.doc_type}`, message: action === "verify" ? "An administrator verified your document." : `Reason: ${reason.trim().slice(0, 300)}` });
  return after;
}
