"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { Field, Notice, btn, inputCls } from "../ui";

const TYPES: [string, string][] = [["new_assignment", "New examination assignment"], ["application_deadline", "Application deadline"], ["application_reminder", "Application submission reminder"], ["missing_documents", "Missing application documents"], ["missing_receipt", "Missing payment receipt"], ["reimbursement_submission", "Reimbursement submission"], ["reimbursement_correction", "Reimbursement correction"], ["admit_card_collection", "Admit card collection"], ["exam_date_confirmation", "Exam date confirmation"], ["travel_requirements", "Travel requirements"], ["accommodation_requirements", "Accommodation requirements"], ["urgent_instruction", "Urgent administrative instruction"]];

export default function NotifyForm({ smes, exams }: { smes: { sme_id: string; full_name: string; department: string }[]; exams: { exam_id: string; name: string }[] }) {
  const router = useRouter();
  const [audience, setAudience] = useState("selected"); const [ids, setIds] = useState<string[]>([]); const [examId, setExamId] = useState("");
  const [type, setType] = useState("urgent_instruction"); const [subject, setSubject] = useState(""); const [message, setMessage] = useState("");
  const [batch, setBatch] = useState(() => crypto.randomUUID()); // one per composed message: a double click can never send twice
  const [pv, setPv] = useState<null | { recipients: number; names: string[]; requiresConfirmation: boolean }>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [fields, setFields] = useState<Record<string, string>>({}); const [done, setDone] = useState("");
  const body = (extra: object) => ({ audience: audience === "one" ? "one" : audience, sme_ids: ids, exam_id: examId, type, subject, message, batch_id: batch, ...extra });

  async function preview() {
    setBusy(true); setErr(""); setFields({}); setDone("");
    const r = await api("/api/admin/notifications", "POST", body({ preview: true })); setBusy(false);
    if (!r.ok) { setPv(null); setErr(r.data.error ?? "Could not preview."); setFields(r.data.fields ?? {}); } else setPv(r.data.preview);
  }
  async function send() {
    if (!pv) return; setBusy(true); setErr("");
    const r = await api("/api/admin/notifications", "POST", body({ expected_count: pv.recipients })); setBusy(false);
    if (r.data.result) {
      const x = r.data.result; setDone(`Created ${x.created} notification${x.created === 1 ? "" : "s"}${x.failed ? `, ${x.failed} failed` : ""}. Emails are sent in the background; check delivery status below.`);
      setPv(null); if (!x.failed) { setSubject(""); setMessage(""); setBatch(crypto.randomUUID()); } router.refresh();
    } else { setErr(r.data.error ?? "Could not send."); }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Send to" htmlFor="aud"><select id="aud" className={inputCls} value={audience} onChange={(e) => { setAudience(e.target.value); setPv(null); }}><option value="one">One SME</option><option value="selected">Selected SMEs</option><option value="exam">Everyone assigned to an exam</option><option value="all">All active SMEs</option></select></Field>
        <Field label="Type" htmlFor="typ"><select id="typ" className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      </div>
      {(audience === "one" || audience === "selected") && (
        <fieldset className="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-2"><legend className="px-1 text-sm font-medium">Choose SMEs ({ids.length})</legend>
          {smes.map((s) => <label key={s.sme_id} className="flex min-h-9 items-center gap-2 text-sm"><input type={audience === "one" ? "radio" : "checkbox"} name="nsme" checked={ids.includes(s.sme_id)} onChange={(e) => { setPv(null); setIds(audience === "one" ? [s.sme_id] : e.target.checked ? [...ids, s.sme_id] : ids.filter((x) => x !== s.sme_id)); }} />{s.full_name} <span className="text-slate-500">· {s.department}</span></label>)}</fieldset>)}
      {audience === "exam" && <Field label="Examination" htmlFor="ex"><select id="ex" className={inputCls} value={examId} onChange={(e) => { setExamId(e.target.value); setPv(null); }}><option value="">Select…</option>{exams.map((x) => <option key={x.exam_id} value={x.exam_id}>{x.name}</option>)}</select></Field>}
      <Field label="Subject" htmlFor="sub" error={fields.subject}><input id="sub" className={inputCls} value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} /></Field>
      <Field label="Message" htmlFor="msg" error={fields.message}><textarea id="msg" rows={4} className={inputCls} value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} /></Field>
      {err && <Notice kind="error">{err}</Notice>}
      {done && <Notice kind="success">{done}</Notice>}
      {pv && <Notice kind={pv.recipients ? "info" : "warn"}><p className="font-medium">{pv.recipients} recipient{pv.recipients === 1 ? "" : "s"}{pv.names.length ? `: ${pv.names.join(", ")}${pv.recipients > pv.names.length ? "…" : ""}` : ""}</p></Notice>}
      <div className="flex gap-2"><button disabled={busy} onClick={preview} className={btn()}>Preview recipients</button>{pv && pv.recipients > 0 && <button disabled={busy} onClick={send} className={btn("primary")}>Send to {pv.recipients}</button>}</div>
    </div>
  );
}
