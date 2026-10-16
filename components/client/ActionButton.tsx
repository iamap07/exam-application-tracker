"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { btn } from "../ui";

export default function ActionButton(p: { label: string; url: string; method?: string; body?: unknown; confirm?: string; askReason?: string; variant?: "primary" | "secondary" | "danger"; small?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    let body = p.body;
    if (p.askReason) { const reason = window.prompt(p.askReason); if (!reason) return; body = { ...(p.body as object), reason }; }
    else if (p.confirm && !window.confirm(p.confirm)) return;
    setBusy(true); setErr("");
    const r = await api(p.url, p.method ?? "POST", body);
    setBusy(false);
    if (!r.ok) setErr(r.data.error ?? "Failed"); else router.refresh();
  }
  return (<span className="inline-flex flex-col"><button type="button" disabled={busy} onClick={go} className={btn(p.variant)}>{busy ? "Working…" : p.label}</button>{err && <span role="alert" className="mt-1 max-w-56 text-xs text-rose-700">{err}</span>}</span>);
}
