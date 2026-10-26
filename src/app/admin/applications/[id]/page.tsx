import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { canViewFinancial } from "@/lib/auth/permissions";
import { SHEETS } from "@/lib/sheets/schema";
import { findById } from "@/lib/sheets/store";
import { REVIEW_TRANSITIONS } from "@/lib/constants";
import { Badge, Card, PageHeader } from "@/components/ui";
import ReviewPanel from "@/components/client/ReviewPanel";
import DocList from "@/components/DocList";
import { readAll } from "@/lib/sheets/store";

export default async function AppDetail({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireAdmin();
  const { id } = await params;
  const app = await findById(SHEETS.Application_Responses, id);
  if (!app) notFound();
  const [sme, exam, fin] = await Promise.all([findById(SHEETS.SME_Master, app.sme_id), findById(SHEETS.Exam_Master, app.exam_id), canViewFinancial(s)]);
  const docs = (await readAll(SHEETS.Document_Registry)).rows.filter((d) => d.assignment_id === app.assignment_id && d.verification_status !== "Superseded");
  const allowed = Object.entries(REVIEW_TRANSITIONS).filter(([, r]) => r.from.includes(app.status)).map(([k]) => k);
  const rows: [string, string][] = [["SME", `${sme?.full_name ?? app.sme_id} (${sme?.email ?? ""})`], ["Examination", exam?.name ?? app.exam_id], ["Registration number", app.registration_no], ["Applied post / level", app.applied_post], ["Centre / city", app.centre_city], ["Submitted", app.submitted_at], ["Start date", app.start_date], ["Remarks from SME", app.remarks], ["Last correction request", app.correction_note], ["Verified by", app.verified_by ? `${app.verified_by} on ${app.verified_at.slice(0, 10)}` : ""],
    ...(fin ? ([["Fee", app.fee], ["Amount paid", app.amount_paid], ["Payment mode", app.payment_mode], ["Payment reference", app.payment_ref]] as [string, string][]) : [])];
  return (
    <>
      <PageHeader title="Application review" sub={app.application_id} actions={<Badge>{app.status}</Badge>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Submitted details"><dl className="space-y-2 text-sm">{rows.map(([k, v]) => <div key={k} className="grid grid-cols-[10rem_1fr] gap-2"><dt className="text-slate-500">{k}</dt><dd className="break-words">{v || "—"}</dd></div>)}</dl>{!fin && <p className="mt-3 text-xs text-slate-500">Payment details are hidden for your role. A Super Admin can change this in Settings.</p>}</Card>
        <Card title="Decision"><ReviewPanel applicationId={id} allowed={allowed} /><p className="mt-3 text-xs text-slate-500">Verification needs the application form (and the payment receipt when an amount was paid) to be uploaded.</p></Card>
        <Card title="Documents" className="lg:col-span-2"><DocList docs={docs} /></Card>
      </div>
    </>
  );
}
