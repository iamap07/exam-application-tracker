import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { getPolicy } from "@/lib/services/common";
import { bucketFor, effectiveExamDate, FLAG_LABELS, readinessFlags } from "@/lib/readiness";
import { daysBetween, todayIST } from "@/lib/dates";
import { Card, PageHeader } from "@/components/ui";

export default async function Readiness() {
  await requireAdmin();
  const [b, policy] = await Promise.all([loadAll(), getPolicy()]);
  const today = todayIST();
  const smeBy = new Map(b.smes.map((x) => [x.sme_id, x])), examBy = new Map(b.exams.map((e) => [e.exam_id, e]));
  const apps = new Map(b.apps.map((a) => [a.assignment_id, a]));
  const items = b.assignments.filter((a) => a.assignment_status === "Active" && !["Cancelled", "Rejected"].includes(apps.get(a.assignment_id)?.status ?? "")).flatMap((a) => {
    const exam = examBy.get(a.exam_id); if (!exam) return [];
    const admit = b.admit.find((r) => r.assignment_id === a.assignment_id), travel = b.travel.find((r) => r.assignment_id === a.assignment_id);
    const date = effectiveExamDate(exam, admit); if (!date) return [];
    const days = daysBetween(today, date), bucket = bucketFor(days, policy.windows); if (bucket === null) return [];
    const hasDoc = b.docs.some((d) => d.assignment_id === a.assignment_id && d.doc_type === "admit_card" && !["Superseded", "Rejected"].includes(d.verification_status));
    return [{ a, exam, date, days, bucket, sme: smeBy.get(a.sme_id)?.full_name ?? a.sme_id, flags: readinessFlags({ exam, admit, travel, hasDoc, today }) }];
  }).sort((x, y) => x.days - y.days);
  const buckets = [...policy.windows].sort((x, y) => x - y);
  return (
    <>
      <PageHeader title="Readiness" sub={`Exams starting within ${policy.windows.join(", ")} days. Change the windows in Settings.`} />
      <div className="space-y-6">{buckets.map((w) => { const list = items.filter((i) => i.bucket === w); return (
        <Card key={w} title={`Within ${w} day${w === 1 ? "" : "s"} (${list.length})`}>
          {list.length === 0 ? <p className="text-sm text-slate-500">Nothing in this window.</p> : (
            <ul className="divide-y divide-slate-100">{list.map((i) => (
              <li key={i.a.assignment_id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span><span className="font-medium">{i.sme}</span> · {i.exam.name}</span><span className="tabular-nums text-slate-600">{i.date} ({i.days === 0 ? "today" : `in ${i.days}d`})</span></div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">{i.flags.length === 0 ? <span className="text-emerald-800">Ready</span> : i.flags.map((f) => <span key={f} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-900 ring-1 ring-inset ring-amber-200">{FLAG_LABELS[f]}</span>)}
                  <Link className="ml-auto text-xs text-teal-800 underline" href={`/admin/admit-cards/${i.a.assignment_id}`}>Exam details</Link>{b.travel.some((t) => t.assignment_id === i.a.assignment_id) && <Link className="text-xs text-teal-800 underline" href={`/admin/travel/${i.a.assignment_id}`}>Travel</Link>}</div></li>))}</ul>)}
        </Card>); })}</div>
    </>
  );
}
