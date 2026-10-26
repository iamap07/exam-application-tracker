import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { loadAll, smeDashboard } from "@/lib/services/dashboard";
import { Badge, Card, Kpi, Notice, PageHeader } from "@/components/ui";

export default async function SmeHome() {
  const s = await requireRole("sme");
  const d = smeDashboard(await loadAll(), s.smeId!); // data is filtered to the session's own SME_ID
  return (
    <>
      <PageHeader title={`Hello, ${d.me.full_name.split(" ")[0]}`} sub={`Profile ${d.profilePct}% complete.`} />
      {d.actions.length > 0 ? (
        <Card title="My pending actions" className="mb-6"><ul className="space-y-2 text-sm">{d.actions.map((a, i) => <li key={i}><Link href={a.href} className={a.urgent ? "font-medium text-rose-800 underline" : "text-teal-800 underline"}>{a.text}</Link></li>)}</ul></Card>
      ) : <div className="mb-6"><Notice kind="success">You're all caught up.</Notice></div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{d.kpis.map((k) => <Kpi key={k.key} label={k.label} value={k.value} href={k.href} />)}</div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="My upcoming exams">{d.upcomingList.length === 0 ? <p className="text-sm text-slate-500">No upcoming exams with a date yet.</p> : <ul className="space-y-3 text-sm">{d.upcomingList.map(({ a, ex, app }) => <li key={a.assignment_id}><div className="flex justify-between gap-2"><span className="font-medium">{ex.name}</span><span className="tabular-nums">{ex.exam_date}</span></div><div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">{ex.city_centre && <span>{ex.city_centre}</span>}<Badge>{app?.status ?? "Not Started"}</Badge>{a.deadline && <span>Apply by {a.deadline}</span>}</div></li>)}</ul>}</Card>
        <Card title={`Notifications (${d.unreadCount} unread)`}>{d.unread.length === 0 ? <p className="text-sm text-slate-500">No unread notifications.</p> : <ul className="space-y-2 text-sm">{d.unread.map((n) => <li key={n.notification_id}><span className="font-medium">{n.subject}</span><span className="block text-slate-600">{n.message}</span></li>)}</ul>}<Link className="mt-3 inline-block text-sm text-teal-800 underline" href="/sme/notifications">View all</Link></Card>
      </div>
      <p className="mt-6 text-xs text-slate-500">Documents, reimbursements, admit cards and travel appear here as those modules are switched on.</p>
    </>
  );
}
