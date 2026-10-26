import { requireRole } from "@/lib/auth/session";
import { SHEETS } from "@/lib/sheets/schema";
import { findById } from "@/lib/sheets/store";
import { Card, PageHeader } from "@/components/ui";
import GenericForm from "@/components/client/GenericForm";

export default async function Profile() {
  const s = await requireRole("sme");
  const me = (await findById(SHEETS.SME_Master, s.smeId!))!;
  const admin: [string, string][] = [["SME ID", me.sme_id], ["Name", me.full_name], ["Email", me.email], ["Employee ID", me.employee_id], ["Department", me.department], ["Subjects", me.subjects], ["Designation", me.designation], ["Joining date", me.joining_date], ["Reporting manager", me.reporting_manager]];
  return (
    <>
      <PageHeader title="My profile" sub={`Profile complete: ${me.profile_complete}. Contact your administrator to change the details marked as admin-managed.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Admin-managed details"><dl className="space-y-2 text-sm">{admin.map(([k, v]) => <div key={k} className="grid grid-cols-[9rem_1fr] gap-2"><dt className="text-slate-500">{k}</dt><dd>{v || "—"}</dd></div>)}</dl></Card>
        <Card title="Details you can update"><GenericForm fields={[{ name: "mobile", label: "Mobile number" }, { name: "emergency_contact", label: "Emergency contact (name and number)", help: "Needed for company-arranged travel." }]} initial={me} url="/api/sme/profile" method="PATCH" actions={[{ label: "Save profile", primary: true }]} success="Profile saved." /></Card>
      </div>
    </>
  );
}
