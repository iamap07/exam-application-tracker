import { requireAdmin } from "@/lib/auth/session";
import { SHEETS } from "@/lib/sheets/schema";
import { readAll } from "@/lib/sheets/store";
import { applyTable, parseQuery } from "@/lib/table";
import { Badge, Card, DataTable, FilterBar, PageHeader } from "@/components/ui";
import GenericForm, { type FieldDef } from "@/components/client/GenericForm";
import ActionButton from "@/components/client/ActionButton";

const FIELDS: FieldDef[] = [
  { name: "full_name", label: "Full name", required: true }, { name: "email", label: "Official email", type: "email", required: true },
  { name: "employee_id", label: "Employee ID" }, { name: "mobile", label: "Mobile number" },
  { name: "department", label: "Department / category", required: true }, { name: "subjects", label: "Subjects or examinations handled" },
  { name: "designation", label: "Designation" }, { name: "joining_date", label: "Joining date", type: "date" },
  { name: "reporting_manager", label: "Reporting manager" }, { name: "emergency_contact", label: "Emergency contact (name and number)" },
];

export default async function Smes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { rows } = await readAll(SHEETS.SME_Master);
  const qy = parseQuery(sp, ["account_status", "department"]);
  const t = applyTable(rows, qy, ["full_name", "email", "sme_id", "employee_id", "subjects"]);
  return (
    <>
      <PageHeader title="SMEs" sub="Add an SME to send an invitation. They appear as Active after accepting it." />
      <Card title="Add an SME" className="mb-6"><GenericForm fields={FIELDS} initial={{}} url="/api/admin/smes" method="POST" actions={[{ label: "Add SME and send invite", primary: true }]} success="SME added and invitation sent." resetOnSuccess /></Card>
      <FilterBar sp={sp} filters={[{ key: "account_status", label: "Status", options: ["Pending Invite", "Active", "Deactivated"] }, { key: "department", label: "Department", options: [...new Set(rows.map((r) => r.department).filter(Boolean))].sort() }]} />
      <DataTable sp={sp} {...t} empty="No SMEs match. Add your first SME above." cols={[
        { key: "full_name", label: "Name", sortable: true, render: (r) => <div><div className="font-medium">{r.full_name}</div><div className="text-xs text-slate-500">{r.sme_id}</div></div> },
        { key: "email", label: "Email", sortable: true }, { key: "department", label: "Department", sortable: true },
        { key: "account_status", label: "Status", render: (r) => <Badge>{r.account_status}</Badge> },
        { key: "profile_complete", label: "Profile complete" },
        { key: "actions", label: "", render: (r) => (<div className="flex flex-wrap gap-2">
          {r.account_status === "Pending Invite" && <ActionButton label="Resend invite" url={`/api/admin/smes/${r.sme_id}`} method="PATCH" body={{ action: "resend_invite" }} />}
          {r.account_status !== "Deactivated" ? <ActionButton label="Deactivate" variant="danger" url={`/api/admin/smes/${r.sme_id}`} method="PATCH" body={{ action: "deactivate" }} confirm={`Deactivate ${r.full_name}? They lose access immediately.`} /> : <ActionButton label="Reactivate" url={`/api/admin/smes/${r.sme_id}`} method="PATCH" body={{ action: "reactivate" }} />}
        </div>) },
      ]} />
    </>
  );
}
