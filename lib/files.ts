// Pure helpers (no I/O) so they can be unit-tested.
export const DOC_TYPES = {
  application_form: { label: "Application form", folder: "01_Application_Form", smeCanUpload: true },
  payment_receipt: { label: "Payment receipt", folder: "02_Payment_Receipt", smeCanUpload: true },
  admit_card: { label: "Admit card", folder: "03_Admit_Card", smeCanUpload: true },
  reimbursement_proof: { label: "Reimbursement proof", folder: "04_Reimbursement", smeCanUpload: true },
  exam_communication: { label: "Exam communication", folder: "05_Exam_Communication", smeCanUpload: true },
  travel_accommodation: { label: "Travel / accommodation document", folder: "06_Travel_Accommodation", smeCanUpload: false },
  other: { label: "Other document", folder: "07_Other_Documents", smeCanUpload: true },
} as const;
export type DocType = keyof typeof DOC_TYPES;
export const isDocType = (v: string): v is DocType => v in DOC_TYPES;
export const SUBFOLDERS: string[] = Object.values(DOC_TYPES).map((d) => d.folder);

const MIME_BY_EXT: Record<string, string[]> = {
  pdf: ["application/pdf"], jpg: ["image/jpeg", "image/jpg", "image/pjpeg"], jpeg: ["image/jpeg", "image/jpg", "image/pjpeg"], png: ["image/png"],
  webp: ["image/webp"], docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};
export const DEFAULT_ALLOWED = ["pdf", "jpg", "jpeg", "png"];
export const OPTIONAL_TYPES = ["webp", "docx"]; // admin may enable these
/** Vercel serverless request bodies are capped near 4.5 MB, so uploads through this app are capped at 4 MB. */
export const HARD_MAX_BYTES = 4 * 1024 * 1024;

export const extOf = (name: string) => (name.includes(".") ? name.split(".").pop()!.toLowerCase() : "");

export function sniff(b: Uint8Array): "pdf" | "jpg" | "png" | "webp" | "zip" | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length < 12) return null;
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf";
  if (at(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  if (at(0, 0x50, 0x4b, 0x03, 0x04)) return "zip";
  return null;
}

/** Server-side check: size, extension allow-list, declared MIME, and real file signature must all agree. */
export function validateUpload(p: { name: string; declaredMime: string; bytes: Uint8Array; allowed: string[]; maxBytes: number }): { ok: true; ext: string; mime: string } | { ok: false; error: string } {
  const ext = extOf(p.name);
  if (p.bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (p.bytes.length > Math.min(p.maxBytes, HARD_MAX_BYTES)) return { ok: false, error: `The file is larger than the ${Math.round(Math.min(p.maxBytes, HARD_MAX_BYTES) / 1048576)} MB limit.` };
  if (!ext || !p.allowed.includes(ext) || !MIME_BY_EXT[ext]) return { ok: false, error: `Files of type ".${ext || "?"}" are not allowed. Allowed: ${p.allowed.join(", ")}.` };
  if (!MIME_BY_EXT[ext].includes(p.declaredMime.toLowerCase())) return { ok: false, error: "The file type does not match its extension." };
  const kind = sniff(p.bytes);
  const expected = ext === "jpeg" ? "jpg" : ext === "docx" ? "zip" : ext;
  if (kind !== expected) return { ok: false, error: "The file contents do not match its type. It may be corrupted or renamed." };
  return { ok: true, ext, mime: MIME_BY_EXT[ext][0] };
}

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const ext = extOf(base);
  const stem = (ext ? base.slice(0, -(ext.length + 1)) : base).normalize("NFKC").replace(/[^A-Za-z0-9._ -]/g, "_").replace(/_{2,}/g, "_").replace(/^[.\s_-]+/, "").trim().slice(0, 80);
  return `${stem || "file"}${ext ? "." + ext.replace(/[^a-z0-9]/g, "") : ""}`;
}

/** Folder-name normalisation: letters, digits, space, dash, underscore, dot only; spaces become underscores. */
export function normalizeName(s: string, max = 60): string {
  return s.normalize("NFKC").replace(/[^A-Za-z0-9 _.-]/g, "").trim().replace(/\s+/g, "_").slice(0, max) || "Unnamed";
}

/** Accepts a bare folder ID or any Drive folder URL. */
export function parseFolderId(input: string): string {
  const t = input.trim();
  const m = t.match(/\/folders\/([A-Za-z0-9_-]+)/) ?? t.match(/[?&]id=([A-Za-z0-9_-]+)/);
  return m ? m[1] : t;
}
