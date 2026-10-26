import "server-only";
import { Readable } from "stream";
import { getGoogle } from "./client";
import { requireEnv } from "@/lib/env";
import { withRetry } from "@/lib/sheets/retry";
import { parseFolderId } from "@/lib/files";

export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const parentFolderId = () => parseFolderId(requireEnv().GOOGLE_DRIVE_PARENT_FOLDER_ID);
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const common = { supportsAllDrives: true } as const;

export interface DriveItem { id: string; url: string }

/** Lookup by our own appProperties tag. This makes folder/file creation idempotent even if a Sheets write failed after the Drive call. */
export async function findByProp(parent: string, key: "eat_key" | "eat_upload_key", value: string): Promise<DriveItem | null> {
  const { drive } = getGoogle();
  const q = `'${esc(parent)}' in parents and trashed=false and appProperties has { key='${key}' and value='${esc(value)}' }`;
  const r = await withRetry(() => drive.files.list({ q, fields: "files(id,webViewLink)", pageSize: 2, includeItemsFromAllDrives: true, ...common }));
  const f = r.data.files?.[0];
  return f?.id ? { id: f.id, url: f.webViewLink ?? `https://drive.google.com/drive/folders/${f.id}` } : null;
}

export async function createFolder(parent: string, name: string, key: string): Promise<DriveItem> {
  const { drive } = getGoogle();
  const r = await withRetry(() => drive.files.create({ requestBody: { name, mimeType: FOLDER_MIME, parents: [parent], appProperties: { eat_key: key } }, fields: "id,webViewLink", ...common }));
  if (!r.data.id) throw new Error("Drive did not return a folder id");
  return { id: r.data.id, url: r.data.webViewLink ?? `https://drive.google.com/drive/folders/${r.data.id}` };
}

export async function folderExists(id: string): Promise<boolean> {
  const { drive } = getGoogle();
  try {
    const r = await withRetry(() => drive.files.get({ fileId: id, fields: "id,trashed,mimeType", ...common }));
    return !r.data.trashed && r.data.mimeType === FOLDER_MIME;
  } catch (e) {
    const s = (e as { response?: { status?: number } }).response?.status;
    if (s === 404) return false;
    throw e;
  }
}

export async function uploadFile(parent: string, name: string, mime: string, bytes: Buffer, uploadKey: string): Promise<DriveItem & { created: boolean }> {
  const existing = await findByProp(parent, "eat_upload_key", uploadKey); // retry-safe: never upload the same logical file twice
  if (existing) return { ...existing, created: false };
  const { drive } = getGoogle();
  const r = await withRetry(() => drive.files.create({ requestBody: { name, parents: [parent], appProperties: { eat_upload_key: uploadKey } }, media: { mimeType: mime, body: Readable.from(bytes) }, fields: "id,webViewLink", ...common }));
  if (!r.data.id) throw new Error("Drive did not return a file id");
  return { id: r.data.id, url: r.data.webViewLink ?? `https://drive.google.com/file/d/${r.data.id}/view`, created: true };
}

export async function downloadFile(id: string): Promise<Buffer> {
  const { drive } = getGoogle();
  const r = await withRetry(() => drive.files.get({ fileId: id, alt: "media", ...common }, { responseType: "arraybuffer" }));
  return Buffer.from(r.data as ArrayBuffer);
}

export async function deleteFile(id: string): Promise<void> {
  const { drive } = getGoogle();
  await withRetry(() => drive.files.delete({ fileId: id, ...common }));
}

export async function checkDriveHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { drive } = getGoogle();
    const m = await withRetry(() => drive.files.get({ fileId: parentFolderId(), fields: "id,name,mimeType,capabilities(canAddChildren)", ...common }));
    if (m.data.mimeType !== FOLDER_MIME) return { ok: false, detail: "The configured Drive ID is not a folder." };
    if (!m.data.capabilities?.canAddChildren) return { ok: false, detail: "The service account can see the folder but cannot add files. Share it with Editor access." };
    return { ok: true, detail: `Connected to folder "${m.data.name}"` };
  } catch {
    return { ok: false, detail: "Cannot open the parent folder. Check the folder ID and that it is shared with the service account." };
  }
}
