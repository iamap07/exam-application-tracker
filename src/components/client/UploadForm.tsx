"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice, btn, inputCls } from "../ui";

export default function UploadForm(p: { assignmentId: string; types: { value: string; label: string }[]; fixedType?: string; replaceId?: string; accept: string; maxMb: number; label?: string }) {
  const router = useRouter();
  const [type, setType] = useState(p.fixedType ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID()); // kept across retries so a retry can never create a duplicate
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "warn"; text: string } | null>(null);
  const allowedExt = p.accept.split(",").map((x) => x.replace(".", ""));

  async function go(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!type) return setMsg({ kind: "error", text: "Choose a document type." });
    if (!file) return setMsg({ kind: "error", text: "Choose a file." });
    if (file.size > p.maxMb * 1048576) return setMsg({ kind: "error", text: `That file is over ${p.maxMb} MB.` });
    if (!allowedExt.includes(file.name.split(".").pop()?.toLowerCase() ?? "")) return setMsg({ kind: "error", text: `Allowed types: ${allowedExt.join(", ")}.` });
    setBusy(true);
    const fd = new FormData();
    fd.set("assignment_id", p.assignmentId); fd.set("doc_type", type); fd.set("upload_key", key); fd.set("file", file);
    if (p.replaceId) fd.set("replace_document_id", p.replaceId);
    try {
      const r = await fetch("/api/documents", { method: "POST", body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg({ kind: "error", text: data.error ?? "Upload failed. Nothing was saved." }); }
      else { setMsg({ kind: data.warning ? "warn" : "success", text: data.warning ?? "Uploaded. An administrator will verify it." }); setFile(null); setKey(crypto.randomUUID()); (e.target as HTMLFormElement).reset(); router.refresh(); }
    } catch { setMsg({ kind: "error", text: "Network error. Nothing was saved; you can safely try again." }); }
    setBusy(false);
  }
  return (
    <form onSubmit={go} className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {!p.fixedType && (<div><label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`t-${p.assignmentId}`}>Document type</label><select id={`t-${p.assignmentId}`} className={inputCls} value={type} onChange={(e) => setType(e.target.value)}><option value="">Select…</option>{p.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>)}
        <div className="min-w-48 flex-1"><label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`f-${p.assignmentId}-${p.replaceId ?? "new"}`}>File (max {p.maxMb} MB)</label><input id={`f-${p.assignmentId}-${p.replaceId ?? "new"}`} type="file" accept={p.accept} className={inputCls + " py-1.5"} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <button disabled={busy} className={btn("primary")}>{busy ? "Uploading…" : p.label ?? "Upload"}</button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </form>
  );
}
