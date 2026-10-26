import { driveState as D, type DriveItem } from "./state";
export const FOLDER_MIME = "application/vnd.google-apps.folder";
export const parentFolderId = () => "ROOT";
const url = (i: DriveItem) => `https://drive.test/${i.isFolder ? "folders" : "files"}/${i.id}`;
const mk = (p: Partial<DriveItem> & { name: string; parent: string; isFolder: boolean }): DriveItem => { const it = { id: `D${++D.seq}`, props: {}, trashed: false, ...p } as DriveItem; D.items.push(it); return it; };
const err404 = () => Object.assign(new Error("not found"), { response: { status: 404 } });

export async function findByProp(parent: string, key: "eat_key" | "eat_upload_key", value: string) {
  const f = D.items.find((i) => i.parent === parent && !i.trashed && i.props[key] === value);
  return f ? { id: f.id, url: url(f) } : null;
}
export async function createFolder(parent: string, name: string, key: string) { const f = mk({ name, parent, isFolder: true, props: { eat_key: key } }); return { id: f.id, url: url(f) }; }
export async function folderExists(id: string) { const f = D.items.find((i) => i.id === id); return !!f && f.isFolder && !f.trashed; }
export async function uploadFile(parent: string, name: string, mime: string, bytes: Buffer, uploadKey: string) {
  const ex = await findByProp(parent, "eat_upload_key", uploadKey); if (ex) return { ...ex, created: false };
  if (D.failUpload > 0) { D.failUpload--; throw Object.assign(new Error("drive down"), { response: { status: 500 } }); }
  if (!D.items.some((i) => i.id === parent && !i.trashed)) throw err404();
  const f = mk({ name, parent, isFolder: false, mime, bytes, props: { eat_upload_key: uploadKey } }); return { id: f.id, url: url(f), created: true };
}
export async function downloadFile(id: string) { const f = D.items.find((i) => i.id === id && !i.trashed); if (!f?.bytes) throw err404(); return f.bytes; }
export async function deleteFile(id: string) { D.items = D.items.filter((i) => i.id !== id); }
export async function checkDriveHealth() { return { ok: true, detail: "fake" }; }
