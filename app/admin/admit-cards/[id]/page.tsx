import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, query } from "@/lib/sheets/store";
import { admitFlags, FLAG_LABELS } from "@/lib/readiness";
import { todayIST } from "@/lib/dates";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import DecisionPanel, { type DecisionAction } from "@/components/client/DecisionPanel";
import DocList from "@/components/DocList";

export default async function AdmitDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const asg = await findById(SHEETS.Exam_Assignments, id);
  if (!asg) notFound();
  const [exam, sme, [ad], docs] = await Promise.all([findById(SHEETS.Exam_Master, asg.exam_id), findById(SHEETS.SME_Master, asg.sme_id), query(SHEETS.Admit_Card_Tracker, (r) => r.assignment_id === id), query(SHEETS.Document_Registry, (d) => d.assignment_id === id && d.doc_type === "admit_card" && d.verification_status !== "Superseded")]);
  const hasDoc = docs.some((d) => d.verification_status !== "Rejected");
  const flags = admitFlags({ exam: exam ?? {}, admit: ad, hasDoc, today: todayIST() });
  const status = ad?.verification_status ?? "Not Submitted";
  const A: DecisionAction[] = [];
  if (status === "Pending Verification") A.push({ key: "verify", label: "Verify details", variant: "primary", reason: "optional", reasonLabel: "Note (optional)", fields: flags.includes("date_differs") ? [{ name: "accept_date_difference", type: "checkbox", label: `The admit card shows ${ad?.confirmed_exam_date}, which differs from the schedule (${exam?.exam_date}). I checked the card and the new date is correct.` }] : undefined, confirm: "Mark these exam details as verified? This also marks the admit card document as verified." });
  if (["Pending Verification", "Verified"].includes(status)) A.push({ key: "request_correction", label: status === "Verified" ? "Reopen for correction" : "Request correction", reason: "required", reasonLabel: "What needs correcting? The SME sees this" });
  const cmp: [string, string, string][] = [["Exam date", exam?.exam_date ?? "", ad?.confirmed_exam_date ?? ""], ["City / centre (planned)", exam?.city_centre ?? "", [ad?.city, ad?.centre_name].filter(Boolean).join(" · ")], ["Reporting time", "", ad?.reporting_time ?? ""], ["Shift", "", ad?.shift ?? ""], ["Centre address", "", ad?.centre_address ?? ""], ["Travel required", "", ad?.travel_required ?? ""], ["Accommodation required", "", ad?.accommodation_required ?? ""], ["Other needs", "", ad?.extra_requirements ?? ""], ["SME confirmed on", "", ad?.sme_confirmed_at?.slice(0, 16).replace("T", " ") ?? ""]];
  return (
    <>
      <PageHeader title="Verify exam details" sub={`${sme?.full_name} · ${exam?.name}`} actions={<Badge>{status}</Badge>} />
      {flags.length > 0 && <div className="mb-4"><Notice kind="warn">{flags.map((f) => FLAG_LABELS[f]).join(" · ")}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Schedule vs what the SME confirmed"><table className="w-full text-sm"><thead><tr className="text-left text-slate-500"><th className="py-1 pr-2 font-medium">Item</th><th className="py-1 pr-2 font-medium">Exam schedule</th><th className="py-1 font-medium">SME confirmed</th></tr></thead><tbody>{cmp.map(([k, a, b]) => <tr key={k} className="border-t border-slate-100 align-top"><td className="py-1.5 pr-2 text-slate-500">{k}</td><td className="py-1.5 pr-2">{a || "—"}</td><td className={`py-1.5 ${a && b && k === "Exam date" && a !== b ? "font-semibold text-amber-800" : ""}`}>{b || "—"}</td></tr>)}</tbody></table></Card>
        <Card title="Decision"><DecisionPanel url={`/api/admin/admit-cards/${id}`} actions={A} />{status === "Verified" && <p className="mt-3 text-sm"><Link className="text-teal-800 underline" href="/admin/travel">Go to Travel &amp; Accommodation</Link></p>}</Card>
        <Card title="Admit card document" className="lg:col-span-2"><DocList docs={docs} /></Card>
      </div>
    </>
  );
}
