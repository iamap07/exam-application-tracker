"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { Notice, btn, inputCls, Field } from "../ui";

type P = { sme_id: string; full_name: string };
export default function AssignPanel({ examId, smes, departments, defaultDeadline }: { examId: string; smes: { sme_id: string; full_name: string; department: string; account_status: string }[]; departments: string[]; defaultDeadline: string }) {
  const router = useRouter();
  const [mode, setMode] = useState("selected");
  const [ids, setIds] = useState<string[]>([]);
  const [department, setDepartment] = useState(""); const [subject, setSubject] = useState("");
  const [deadline, setDeadline] = useState(defaultDeadline); const [priority, setPriority] = useState("Normal"); const [remarks, setRemarks] = useState("");
  const [pv, setPv] = useState<null | { willAssign: number; recipients: number; alreadyAssigned: P[]; toReassign: P[]; requiresConfirmation: boolean }>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [done, setDone] = useState<null | { summary: Record<string, number>; results: { sme_id: string; outcome: string; error?: string }[] }>(null);

  const body = () => ({ exam_id: examId, mode: mode === "one" ? "single" : mode, sme_ids: ids, department, subject, deadline, priority, remarks });
  async function preview() {
    setBusy(true); setErr(""); setDone(null);
    const r = await api("/api/admin/assignments/preview", "POST", body()); setBusy(false);
    if (!r.ok) { setPv(null); setErr(r.data.error ?? "Could not preview."); } else setPv(r.data.preview);
  }
  async function confirm() {
    if (!pv) return; setBusy(true); setErr("");
    const r = await api("/api/admin/assignments", "POST", { ...body(), expected_count: pv.willAssign }); setBusy(false);
    if (r.data.summary) { setDone(r.data); setPv(null); router.refresh(); } else { setErr(r.data.error ?? "Assignment failed."); if (r.data.preview) setPv(r.data.preview); }
  }
  const selectable = smes.filter((s) => s.account_status !== "Deactivated");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Assign to" htmlFor="mode"><select id="mode" className={inputCls} value={mode} onChange={(e) => { setMode(e.target.value); setPv(null); }}><option value="one">One SME</option><option value="selected">Selected SMEs</option><option value="all">All active SMEs</option><option value="filtered">SMEs matching a filter</option></select></Field>
        <Field label="Application deadline" htmlFor="dl" help="Defaults to the exam's deadline."><input id="dl" type="date" className={inputCls} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
        <Field label="Priority" htmlFor="pr"><select id="pr" className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)}>{["Low", "Normal", "High", "Urgent"].map((o) => <option key={o}>{o}</option>)}</select></Field>
        <Field label="Remarks to SME" htmlFor="rm"><input id="rm" className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      </div>
      {(mode === "one" || mode === "selected") && (
        <fieldset className="max-h-56 overflow-y-auto rounded-md border border-slate-200 p-2"><legend className="px-1 text-sm font-medium">Choose SMEs ({ids.length} selected)</legend>
          {selectable.length === 0 && <p className="text-sm text-slate-600">No SMEs yet. Add SMEs first.</p>}
          {selectable.map((s) => (<label key={s.sme_id} className="flex min-h-9 items-center gap-2 text-sm"><input type={mode === "one" ? "radio" : "checkbox"} name="sme" checked={ids.includes(s.sme_id)} onChange={(e) => { setPv(null); setIds(mode === "one" ? [s.sme_id] : e.target.checked ? [...ids, s.sme_id] : ids.filter((x) => x !== s.sme_id)); }} />{s.full_name} <span className="text-slate-500">· {s.department}{s.account_status !== "Active" ? ` · ${s.account_status}` : ""}</span></label>))}
        </fieldset>)}
      {mode === "filtered" && (<div className="grid gap-4 sm:grid-cols-2"><Field label="Department / category" htmlFor="dep"><select id="dep" className={inputCls} value={department} onChange={(e) => { setDepartment(e.target.value); setPv(null); }}><option value="">Any</option>{departments.map((d) => <option key={d}>{d}</option>)}</select></Field><Field label="Subject contains" htmlFor="sub"><input id="sub" className={inputCls} value={subject} onChange={(e) => { setSubject(e.target.value); setPv(null); }} /></Field></div>)}
      {err && <Notice kind="error">{err}</Notice>}
      {pv && (<Notice kind={pv.willAssign ? "info" : "warn"}>
        <p className="font-medium">{pv.willAssign} SME{pv.willAssign === 1 ? "" : "s"} will receive this assignment ({pv.recipients} matched).</p>
        {pv.alreadyAssigned.length > 0 && <p className="mt-1">Already assigned and skipped: {pv.alreadyAssigned.map((x) => x.full_name).join(", ")}.</p>}
        {pv.toReassign.length > 0 && <p className="mt-1">Previously revoked and will be reassigned: {pv.toReassign.map((x) => x.full_name).join(", ")}.</p>}
      </Notice>)}
      {done && (<Notice kind={done.summary.failed || done.summary.folderFailures ? "warn" : "success"}>Created {done.summary.created}, reassigned {done.summary.reassigned}, skipped {done.summary.duplicates} duplicates, failed {done.summary.failed}. {done.summary.notificationFailures ? `${done.summary.notificationFailures} in-app notifications failed. ` : ""}{done.summary.folderFailures ? `${done.summary.folderFailures} Drive folders could not be created yet; use "Create folder" on the Assignments page to retry (uploads also retry automatically).` : ""}{done.results.filter((r) => r.error).map((r) => <span key={r.sme_id} className="block">{r.sme_id}: {r.error}</span>)}</Notice>)}
      <div className="flex gap-2"><button disabled={busy} onClick={preview} className={btn()}>Preview recipients</button>{pv && pv.willAssign > 0 && <button disabled={busy} onClick={confirm} className={btn("primary")}>Confirm and assign {pv.willAssign}</button>}</div>
    </div>
  );
}
