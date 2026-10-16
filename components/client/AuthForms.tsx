"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/auth/browser";
import { Field, Notice, btn, inputCls } from "../ui";

export function LoginForm({ error }: { error?: string }) {
  const [mode, setMode] = useState<"password" | "magic" | "forgot">("password");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null); const [busy, setBusy] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const sb = supabaseBrowser();
    if (mode === "password") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg({ kind: "error", text: "Email or password is incorrect." }); else window.location.href = "/";
    } else if (mode === "magic") {
      // shouldCreateUser:false blocks self-registration; only admin-invited accounts can sign in.
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` } });
      setMsg(error ? { kind: "error", text: "Could not send the link. Try again shortly." } : { kind: "success", text: "If this email has an account, a sign-in link is on its way." });
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm?next=/reset-password` });
      setMsg(error ? { kind: "error", text: "Could not send the reset email. Try again shortly." } : { kind: "success", text: "If this email has an account, a reset link is on its way." });
    }
    setBusy(false);
  }
  const errText: Record<string, string> = { link: "That link is invalid or has expired. Request a new one.", expired: "Your invitation has expired. Ask an administrator to resend it.", deactivated: "This account is deactivated. Contact an administrator.", noaccess: "Your account has no access yet. Contact an administrator." };
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && errText[error] && <Notice kind="error">{errText[error]}</Notice>}
      <Field label="Email" htmlFor="email"><input id="email" type="email" autoComplete="email" required className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      {mode === "password" && <Field label="Password" htmlFor="pw"><input id="pw" type="password" autoComplete="current-password" required className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <button disabled={busy} className={btn("primary") + " w-full"}>{mode === "password" ? "Sign in" : mode === "magic" ? "Email me a sign-in link" : "Send reset link"}</button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {mode !== "password" && <button type="button" className="text-teal-800 underline" onClick={() => setMode("password")}>Use password</button>}
        {mode !== "magic" && <button type="button" className="text-teal-800 underline" onClick={() => setMode("magic")}>Email me a link instead</button>}
        {mode !== "forgot" && <button type="button" className="text-teal-800 underline" onClick={() => setMode("forgot")}>Forgot password</button>}
      </div>
    </form>
  );
}

export function ResetPasswordForm() {
  const [pw, setPw] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 10) { setMsg("Use at least 10 characters."); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    if (error) { setMsg(error.message); setBusy(false); } else window.location.href = "/";
  }
  return (<form onSubmit={submit} className="space-y-4"><Field label="New password" htmlFor="npw" help="At least 10 characters."><input id="npw" type="password" autoComplete="new-password" className={inputCls} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>{msg && <Notice kind="error">{msg}</Notice>}<button disabled={busy} className={btn("primary")}>Save password</button></form>);
}

export function SignOutButton({ className }: { className?: string }) {
  return <button className={className ?? btn()} onClick={async () => { await supabaseBrowser().auth.signOut(); window.location.href = "/login"; }}>Sign out</button>;
}
