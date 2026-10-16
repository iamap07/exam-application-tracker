import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { adminDashboard, loadAll } from "@/lib/services/dashboard";
import { BarList, Card, FilterBar, Kpi, PageHeader, btn } from "@/components/ui";

export default async function Overview({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const b = await loadAll();
  const d = adminDashboard(b, { exam_id: sp.exam_id, department: sp.department, from: sp.from, to: sp.to });
  return (
    <>
      <PageHeader title="Overview" sub={`Overall application completion: ${d.overall}%. ${d.overdue} overdue application${d.overdue === 1 ? "" : "s"}. Reimbursement, admit card and travel figures fill in once those modules are in use.`} actions={<Link className={btn()} href="/api/admin/export/assignments">Export assignments</Link>} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div><label htmlFor="exam_id" className="mb-1 block text-xs font-medium text-slate-600">Exam</label><select id="exam_id" name="exam_id" defaultValue={sp.exam_id ?? ""} className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">All</option>{b.exams.map((e) => <option key={e.exam_id} value={e.exam_id}>{e.name}</option>)}</select></div>
        <div><label htmlFor="department" className="mb-1 block text-xs font-medium text-slate-600">Department</label><select id="department" name="department" defaultValue={sp.department ?? ""} className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">All</option>{d.departments.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label htmlFor="from" className="mb-1 block text-xs font-medium text-slate-600">Assigned from</label><input id="from" type="date" name="from" defaultValue={sp.from ?? ""} className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm" /></div>
        <div><label htmlFor="to" className="mb-1 block text-xs font-medium text-slate-600">to</label><input id="to" type="date" name="to" defaultValue={sp.to ?? ""} className="min-h-10 rounded-md border border-slate-300 bg-white px-2 text-sm" /></div>
        <button className={btn("primary")}>Apply</button><Link href="/admin" className={btn()}>Clear</Link>
      </form>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{d.kpis.map((k) => <Kpi key={k.key} label={k.label} value={k.value} href={k.href} />)}</div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Exam-wise application completion"><BarList data={d.byExam} suffix="%" max={100} /></Card>
        <Card title="SME-wise completion (lowest first)"><BarList data={d.bySme} suffix="%" max={100} /></Card>
        <Card title="Applications by status"><BarList data={d.statusDist} /></Card>
        <Card title="Pending applications by deadline"><BarList data={d.pendingByDeadline} /></Card>
        <Card title="Exams per month"><BarList data={d.monthly} /></Card>
        <Card title="Upcoming exams">{d.upcoming.length === 0 ? <p className="text-sm text-slate-500">No upcoming exams.</p> : <ul className="space-y-2 text-sm">{d.upcoming.map((e) => <li key={e.exam_id} className="flex justify-between gap-2"><Link className="text-teal-800 underline" href={`/admin/exams/${e.exam_id}`}>{e.name}</Link><span className="tabular-nums text-slate-600">{e.exam_date}</span></li>)}</ul>}</Card>
      </div>
    </>
  );
}
