import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, readAll } from "@/lib/sheets/store";
import { Badge, Card, PageHeader } from "@/components/ui";
import GenericForm from "@/components/client/GenericForm";
import AssignPanel from "@/components/client/AssignPanel";
import { EXAM_FIELDS } from "../fields";

export default async function ExamDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const exam = await findById(SHEETS.Exam_Master, id);
  if (!exam) notFound();
  const { rows: smes } = await readAll(SHEETS.SME_Master);
  const { rows: asg } = await readAll(SHEETS.Exam_Assignments);
  const count = asg.filter((a) => a.exam_id === id && a.assignment_status === "Active").length;
  const canAssign = ["Open", "Assigned"].includes(exam.status);
  return (
    <>
      <PageHeader title={exam.name} sub={`${exam.exam_id} · ${count} active assignment${count === 1 ? "" : "s"}`} actions={<Badge>{exam.status}</Badge>} />
      <div className="space-y-6">
        <Card title="Assign to SMEs">{canAssign ? <AssignPanel examId={id} smes={smes.map((s) => ({ sme_id: s.sme_id, full_name: s.full_name, department: s.department, account_status: s.account_status }))} departments={[...new Set(smes.map((s) => s.department).filter(Boolean))].sort()} defaultDeadline={exam.application_deadline} /> : <p className="text-sm text-slate-700">This exam is "{exam.status}". Change the status to Open below to assign it.</p>}</Card>
        <Card title="Examination details"><GenericForm fields={EXAM_FIELDS} initial={exam} url={`/api/admin/exams/${id}`} method="PATCH" version={exam.updated_at} actions={[{ label: "Save changes", primary: true }]} success="Examination updated." /></Card>
      </div>
    </>
  );
}
