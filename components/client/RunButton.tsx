"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";
import { Notice, btn } from "../ui";

/** Runs a server action and shows the server's own summary, so the message always reflects what actually happened. */
export default function RunButton(p: { label: string; url: string; body?: unknown; confirm?: string; variant?: "primary" | "secondary" | "danger" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    if (p.confirm && !window.confirm(p.confirm)) return;
    setBusy(true); setMsg(null);
    const r = await api(p.url, "POST", p.body ?? {});
    setBusy(false);
    setMsg({ ok: r.ok, text: r.data.message ?? r.data.error ?? (r.ok ? "Done." : "Failed.") });
    router.refresh();
  }
  return (<div className="space-y-2"><button disabled={busy} onClick={go} className={btn(p.variant)}>{busy ? "Working…" : p.label}</button>{msg && <Notice kind={msg.ok ? "success" : "error"}>{msg.text}</Notice>}</div>);
}
