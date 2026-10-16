import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { HttpError, route } from "@/lib/http";
import { uploadDocument } from "@/lib/services/documents";

export const runtime = "nodejs";
export const maxDuration = 30;

// SMEs and admins. Ownership is enforced inside uploadDocument against the session, never a client-supplied SME id.
export const POST = route(async (req) => {
  const s = await requireRole("sme", "ops_admin", "super_admin");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 4.6 * 1024 * 1024) throw new HttpError(413, "The file is too large. The limit is 4 MB.");
  let form: FormData;
  try { form = await req.formData(); } catch { throw new HttpError(400, "Upload could not be read."); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  const str = (k: string) => String(form.get(k) ?? "");
  const out = await uploadDocument(s, { assignmentId: str("assignment_id"), docType: str("doc_type"), uploadKey: str("upload_key"), replaceDocumentId: str("replace_document_id") || undefined, file });
  return NextResponse.json({ ok: true, document: out.document, replayed: out.replayed, warning: "warning" in out ? out.warning : undefined }, { status: out.replayed ? 200 : 201 });
});
