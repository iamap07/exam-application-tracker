import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { todayIST } from "@/lib/dates";
import { Badge, Card, PageHeader } from "@/components/ui";
import ActionButton from "@/components/client/ActionButton";

export default async function MyExams({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireRole("sme");
  const sp = await searchParams;
  const b = await loadAll();
  let mine = b.assignments.filter((a) => a.sme_id === s.smeId && a.assignment_status === "Active");
  if (sp.ack === "Pending") mine = mine.filter((a) => a.ack_status !== "Acknowledged");
  if (sp.when === "upcoming") mine = mine.filter((a) => (b.exams.find((e) => e.exam_id === a.exam_id)?.exam_date ?? "") >= todayIST());
  return (
    <>
      <PageHeader title="My exams" />
      {mine.length === 0 ? <Card><p className="text-sm text-slate-600">No exams here. Assigned exams appear when your administrator assigns them.</p></Card> : (
        <div className="space-y-3">{mine.map((a) => { const ex = b.exams.find((e) => e.exam_id === a.exam_id); const app = b.apps.find((p) => p.assignment_id === a.assignment_id); return (
          <Card key={a.assignment_id}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{ex?.name}</h2><p className="text-sm text-slate-600">{ex?.organization}</p></div><Badge>{app?.status ?? "Not Started"}</Badge></div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4"><div><dt className="text-slate-500">Apply by</dt><dd>{a.deadline || "—"}</dd></div><div><dt className="text-slate-500">Exam date</dt><dd>{ex?.exam_date || "To be announced"}</dd></div><div><dt className="text-slate-500">Priority</dt><dd>{a.priority}</dd></div><div><dt className="text-slate-500">Acknowledged</dt><dd>{a.ack_status}</dd></div></dl>
            {ex?.instructions && <p className="mt-3 text-sm text-slate-700">{ex.instructions}</p>}
            <div className="mt-3 flex flex-wrap items-start gap-2">{a.ack_status !== "Acknowledged" && <ActionButton label="Acknowledge" variant="primary" url={`/api/sme/assignments/${a.assignment_id}/acknowledge`} />}<Link href={`/sme/applications/${a.assignment_id}`} className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium">Open application</Link>{ex?.application_url && <a href={ex.application_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium">Official application site</a>}</div>
          </Card>); })}</div>)}
    </>
  );
}
