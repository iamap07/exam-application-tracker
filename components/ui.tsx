import Link from "next/link";
import type { ReactNode } from "react";

export const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>{sub && <p className="mt-1 max-w-prose text-sm text-slate-600">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
export const Card = ({ title, children, className }: { title?: string; children: ReactNode; className?: string }) => (
  <section className={cx("rounded-lg border border-slate-200 bg-white p-4", className)}>{title && <h2 className="mb-3 text-sm font-semibold text-slate-800">{title}</h2>}{children}</section>
);

const tone = (s: string) =>
  /verified|paid|active|approved|acknowledged|created|booked|confirmed|yes/i.test(s) ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
  : /correction|rejected|revoked|deactivated|cancelled|failed|expired|overdue/i.test(s) ? "bg-rose-50 text-rose-800 ring-rose-200"
  : /submitted|awaiting|review|pending|invite/i.test(s) ? "bg-amber-50 text-amber-900 ring-amber-200"
  : /progress|open|assigned/i.test(s) ? "bg-sky-50 text-sky-800 ring-sky-200" : "bg-slate-100 text-slate-700 ring-slate-200";
export const Badge = ({ children }: { children: string }) => <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tone(children))}>{children || "—"}</span>;

export const Kpi = ({ label, value, href }: { label: string; value: number | string; href?: string }) => {
  const body = (<><div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div><div className="mt-1 text-xs leading-snug text-slate-600">{label}</div></>);
  const cls = "block rounded-lg border border-slate-200 bg-white p-3";
  return href ? <Link href={href} className={cx(cls, "hover:border-teal-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700")}>{body}</Link> : <div className={cls}>{body}</div>;
};

export function BarList({ data, suffix = "", max }: { data: { label: string; value: number; detail?: string }[]; suffix?: string; max?: number }) {
  if (!data.length) return <p className="text-sm text-slate-500">No data for these filters yet.</p>;
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="text-sm">
          <div className="flex justify-between gap-2"><span className="truncate text-slate-700">{d.label}</span><span className="tabular-nums text-slate-900">{d.value}{suffix}{d.detail ? <span className="ml-1 text-xs text-slate-500">({d.detail})</span> : null}</span></div>
          <div className="mt-1 h-2 rounded bg-slate-100" role="img" aria-label={`${d.label}: ${d.value}${suffix}`}><div className="h-2 rounded bg-teal-700" style={{ width: `${Math.min(100, (d.value / top) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export const Notice = ({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: ReactNode }) => (
  <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-md border px-3 py-2 text-sm", kind === "error" && "border-rose-200 bg-rose-50 text-rose-900", kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900", kind === "warn" && "border-amber-200 bg-amber-50 text-amber-900", kind === "info" && "border-slate-200 bg-slate-50 text-slate-800")}>{children}</div>
);

export const btn = (variant: "primary" | "secondary" | "danger" = "secondary") => cx(
  "inline-flex min-h-10 items-center justify-center rounded-md px-3.5 text-sm font-medium disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
  variant === "primary" && "bg-teal-700 text-white hover:bg-teal-800", variant === "secondary" && "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50", variant === "danger" && "border border-rose-300 bg-white text-rose-800 hover:bg-rose-50");
export const inputCls = "block min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 read-only:bg-slate-50 disabled:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700";

export function Field({ label, error, help, children, htmlFor }: { label: string; error?: string; help?: string; children: ReactNode; htmlFor: string }) {
  return (<div><label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-800">{label}</label>{children}{help && !error && <p className="mt-1 text-xs text-slate-500">{help}</p>}{error && <p className="mt-1 text-xs text-rose-700" id={`${htmlFor}-err`}>{error}</p>}</div>);
}

export interface Col { key: string; label: string; sortable?: boolean; render?: (row: Record<string, string>) => ReactNode }
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function FilterBar({ sp, filters, search = true }: { sp: SP; filters: { key: string; label: string; options: string[] }[]; search?: boolean }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
      {search && <div className="min-w-48 flex-1"><label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">Search</label><input id="q" name="q" defaultValue={one(sp.q)} className={inputCls} placeholder="Name, ID, email…" /></div>}
      {filters.map((f) => (
        <div key={f.key}><label htmlFor={f.key} className="mb-1 block text-xs font-medium text-slate-600">{f.label}</label>
          <select id={f.key} name={f.key} defaultValue={one(sp[f.key])} className={inputCls}><option value="">All</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select></div>
      ))}
      <button className={btn("primary")}>Apply</button>
      <Link href="?" className={btn()}>Clear</Link>
    </form>
  );
}

export function DataTable({ cols, rows, total, page, pages, sp, empty }: { cols: Col[]; rows: Record<string, string>[]; total: number; page: number; pages: number; sp: SP; empty: string }) {
  const href = (patch: Record<string, string>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)])), ...patch })) if (v) p.set(k, v); return `?${p.toString()}`; };
  const sort = one(sp.sort), dir = one(sp.dir);
  if (!rows.length) return <Card><p className="text-sm text-slate-600">{empty}</p></Card>;
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600"><tr>{cols.map((c) => (
            <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 font-medium" aria-sort={sort === c.key ? (dir === "desc" ? "descending" : "ascending") : undefined}>
              {c.sortable ? <Link href={href({ sort: c.key, dir: sort === c.key && dir !== "desc" ? "desc" : "asc", page: "" })} className="hover:text-slate-900">{c.label}{sort === c.key ? (dir === "desc" ? " ↓" : " ↑") : ""}</Link> : c.label}
            </th>))}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map((r, i) => <tr key={i} className="align-top">{cols.map((c) => <td key={c.key} className="px-3 py-2 text-slate-800">{c.render ? c.render(r) : r[c.key] || "—"}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>{total} record{total === 1 ? "" : "s"} · page {page} of {pages}</span>
        <span className="flex gap-2">{page > 1 && <Link className={btn()} href={href({ page: String(page - 1) })}>Previous</Link>}{page < pages && <Link className={btn()} href={href({ page: String(page + 1) })}>Next</Link>}</span>
      </div>
    </div>
  );
}
