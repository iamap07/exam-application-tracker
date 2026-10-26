"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { Notice, btn, inputCls } from "../ui";

export default function ReviewPanel({ applicationId, allowed }: { applicationId: string; allowed: string[] }) {
  const router = useRouter();
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const labels: Record<string, [string, "primary" | "secondary" | "danger"]> = { start_review: ["Start review", "secondary"], verify: ["Verify application", "primary"], request_correction: ["Request correction", "secondary"], reject: ["Reject", "danger"] };
  async function act(action: string) {
    setBusy(true); setErr("");
    const r = await api(`/api/admin/applications/${applicationId}/review`, "POST", { action, reason });
    setBusy(false);
    if (!r.ok) setErr(r.data.error ?? "Failed"); else { setReason(""); router.refresh(); }
  }
  if (!allowed.length) return <p className="text-sm text-slate-600">No review actions are available for this status.</p>;
  return (
    <div className="space-y-3">
      <div><label htmlFor="reason" className="mb-1 block text-sm font-medium">Reason (required for correction or rejection; the SME sees it)</label><textarea id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} /></div>
      {err && <Notice kind="error">{err}</Notice>}
      <div className="flex flex-wrap gap-2">{allowed.map((a) => <button key={a} disabled={busy} onClick={() => act(a)} className={btn(labels[a][1])}>{labels[a][0]}</button>)}</div>
    </div>
  );
}
