"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { Notice, btn, inputCls } from "../ui";

export interface DecisionAction { key: string; label: string; variant?: "primary" | "secondary" | "danger"; reason?: "required" | "optional"; reasonLabel?: string; fields?: { name: string; label: string; type?: "text" | "date" | "checkbox" }[]; confirm?: string }

/** Each decision is its own small form, so required inputs are always next to the button that needs them. */
export default function DecisionPanel({ url, actions }: { url: string; actions: DecisionAction[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [v, setV] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success" | "warn"; text: string } | null>(null);

  async function run(a: DecisionAction) {
    if (a.confirm && !window.confirm(a.confirm)) return;
    setBusy(true); setMsg(null);
    const body: Record<string, unknown> = { action: a.key, reason: a.reason ? String(v[`${a.key}.reason`] ?? "") : "" };
    for (const f of a.fields ?? []) body[f.name] = f.type === "checkbox" ? !!v[`${a.key}.${f.name}`] : String(v[`${a.key}.${f.name}`] ?? "");
    const r = await api(url, "POST", body);
    setBusy(false);
    if (!r.ok) { setMsg({ kind: "error", text: r.data.error ?? "Failed" }); return; }
    setMsg({ kind: r.data.warning ? "warn" : "success", text: r.data.warning ?? "Done." }); setOpen(null); setV({}); router.refresh();
  }
  if (!actions.length) return <p className="text-sm text-slate-600">No actions are available at this stage.</p>;
  return (
    <div className="space-y-2">
      {actions.map((a) => (
        <div key={a.key} className="rounded-md border border-slate-200 p-3">
          {open !== a.key ? (
            a.reason || a.fields ? <button className={btn(a.variant)} onClick={() => { setOpen(a.key); setMsg(null); }}>{a.label}…</button>
              : <button disabled={busy} className={btn(a.variant)} onClick={() => run(a)}>{busy ? "Working…" : a.label}</button>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{a.label}</h3>
              {a.fields?.map((f) => f.type === "checkbox" ? (
                <label key={f.name} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!v[`${a.key}.${f.name}`]} onChange={(e) => setV({ ...v, [`${a.key}.${f.name}`]: e.target.checked })} />{f.label}</label>
              ) : (
                <div key={f.name}><label className="mb-1 block text-sm font-medium" htmlFor={`${a.key}-${f.name}`}>{f.label}</label><input id={`${a.key}-${f.name}`} type={f.type ?? "text"} className={inputCls} value={String(v[`${a.key}.${f.name}`] ?? "")} onChange={(e) => setV({ ...v, [`${a.key}.${f.name}`]: e.target.value })} /></div>
              ))}
              {a.reason && <div><label className="mb-1 block text-sm font-medium" htmlFor={`${a.key}-reason`}>{a.reasonLabel ?? "Reason"} {a.reason === "required" ? "*" : "(optional)"}</label><textarea id={`${a.key}-reason`} rows={2} className={inputCls} value={String(v[`${a.key}.reason`] ?? "")} onChange={(e) => setV({ ...v, [`${a.key}.reason`]: e.target.value })} /></div>}
              <div className="flex gap-2"><button disabled={busy} className={btn(a.variant ?? "primary")} onClick={() => run(a)}>{busy ? "Working…" : "Confirm"}</button><button className={btn()} onClick={() => setOpen(null)}>Cancel</button></div>
            </div>)}
        </div>))}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}
