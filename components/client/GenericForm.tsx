"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { Field, Notice, btn, inputCls } from "../ui";

export interface FieldDef { name: string; label: string; type?: "text" | "email" | "date" | "time" | "datetime-local" | "textarea" | "select"; options?: string[]; required?: boolean; help?: string; readOnly?: boolean; wide?: boolean }
export interface ActionDef { label: string; extra?: Record<string, unknown>; primary?: boolean; confirm?: string }

export default function GenericForm(p: { fields: FieldDef[]; initial: Record<string, string>; url: string; method: "POST" | "PUT" | "PATCH"; actions: ActionDef[]; success: string; version?: string; resetOnSuccess?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.map((f) => [f.name, p.initial[f.name] ?? ""])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "warn"; text: string } | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  async function run(a: ActionDef) {
    if (a.confirm && !window.confirm(a.confirm)) return;
    setBusy(true); setMsg(null); setErrs({});
    const body = { ...v, ...(a.extra ?? {}), ...(p.version ? { expected_updated_at: p.version } : {}) };
    const r = await api(p.url, p.method, body);
    setBusy(false);
    if (!r.ok) { setErrs(r.data.fields ?? {}); setMsg({ kind: "error", text: r.data.error ?? "Not saved." }); return; }
    const warn = r.data.invite && !r.data.invite.sent ? ` The invitation email could not be sent (${r.data.invite.error}). Use "Resend invite" on the SME list.` : r.data.warning ? ` ${r.data.warning}` : "";
    setMsg({ kind: warn ? "warn" : "success", text: p.success + warn });
    if (p.resetOnSuccess) setV(Object.fromEntries(p.fields.map((f) => [f.name, ""])));
    router.refresh();
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); const a = p.actions.find((x) => x.primary) ?? p.actions[0]; if (a) run(a); }} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        {p.fields.map((f) => {
          const id = `f-${f.name}`;
          const common = { id, name: f.name, value: v[f.name], readOnly: f.readOnly, "aria-invalid": !!errs[f.name], "aria-describedby": errs[f.name] ? `${id}-err` : undefined, className: inputCls };
          return (
            <div key={f.name} className={f.wide || f.type === "textarea" ? "sm:col-span-2" : ""}>
              <Field label={f.label + (f.required ? " *" : "")} htmlFor={id} error={errs[f.name]} help={f.help}>
                {f.type === "textarea" ? <textarea {...common} rows={3} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
                  : f.type === "select" ? <select {...common} disabled={f.readOnly} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}><option value="">Select…</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
                  : <input {...common} type={f.type ?? "text"} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />}
              </Field>
            </div>
          );
        })}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="flex flex-wrap gap-2">{p.actions.map((a) => <button key={a.label} type="button" disabled={busy} onClick={() => run(a)} className={btn(a.primary ? "primary" : "secondary")}>{busy ? "Working…" : a.label}</button>)}</div>
    </form>
  );
}
