import { requireAdmin } from "@/lib/auth/session";
import { checkEnv } from "@/lib/env";
import { checkSheetsHealth, getConfig } from "@/lib/sheets/store";
import { checkDriveHealth } from "@/lib/google/drive";
import { integrationStatus } from "@/lib/services/jobs";
import { getPolicy } from "@/lib/services/common";
import { getUploadPolicy } from "@/lib/services/documents";
import GenericForm from "@/components/client/GenericForm";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import ActionButton from "@/components/client/ActionButton";

export default async function Settings() {
  const s = await requireAdmin();
  const env = checkEnv();
  const sheets = env.ok ? await checkSheetsHealth() : { ok: false, detail: "Environment variables are incomplete." };
  const drive = env.ok ? await checkDriveHealth() : { ok: false, detail: "Environment variables are incomplete." };
  const policy = env.ok && sheets.ok ? await getUploadPolicy().catch(() => null) : null;
  const pol = env.ok && sheets.ok ? await getPolicy().catch(() => null) : null;
  const integ = env.ok && sheets.ok ? await integrationStatus().catch(() => null) : null;
  const fin = env.ok ? (await getConfig("ops_can_view_financial").catch(() => null)) === "true" : false;
  return (
    <>
      <PageHeader title="Settings" sub="Integration health is checked live each time you open this page." />
      <div className="space-y-6">
        <Card title="Integration health">
          <ul className="space-y-2 text-sm">
            <li className="flex flex-wrap items-center gap-2"><Badge>{env.ok ? "Yes" : "Failed"}</Badge> Environment variables{!env.ok && <span className="text-rose-700"> — missing: {env.missing.join(", ")}</span>}</li>
            <li className="flex flex-wrap items-center gap-2"><Badge>{sheets.ok ? "Yes" : "Failed"}</Badge> Google Sheets — {sheets.detail}</li>
            <li className="flex flex-wrap items-center gap-2"><Badge>{drive.ok ? "Yes" : "Failed"}</Badge> Google Drive — {drive.detail}</li>
            <li className="flex flex-wrap items-center gap-2"><Badge>{integ?.emailTest?.ok ? "Yes" : integ?.emailConfigured ? "Pending" : "Failed"}</Badge> Email — {integ?.emailTest?.ok ? "test email delivered" : integ?.emailConfigured ? "keys set; send a test email in Notifications to verify" : "RESEND_API_KEY / EMAIL_FROM not set"}</li>
            <li className="flex flex-wrap items-center gap-2"><Badge>{integ?.scheduler.verified ? "Yes" : "Pending"}</Badge> Scheduled jobs — {integ?.scheduler.verified ? "a scheduled run succeeded recently" : "not verified yet (no successful scheduled run in 36 hours)"}</li>
          </ul>
          {env.ok && !sheets.ok && s.role === "super_admin" && <div className="mt-3"><ActionButton label="Create or repair tabs" url="/api/setup/init-schema" variant="primary" confirm="Create any missing tabs and headers? Existing tabs with different headers are never overwritten." /></div>}
        </Card>
        {s.role === "super_admin" && <Card title="Add an Operations admin"><GenericForm fields={[{ name: "email", label: "Email address", type: "email", required: true, help: "They receive an invitation and can manage exams, assignments, documents and travel. Payment details stay hidden unless you allow them below." }]} initial={{}} url="/api/admin/admins" method="POST" actions={[{ label: "Send invitation", primary: true }]} success="Invitation sent." resetOnSuccess /></Card>}
        {s.role === "super_admin" && <Card title="Data integrity"><p className="text-sm">Check for orphaned or inconsistent records across all tabs. <a className="text-teal-800 underline" href="/admin/integrity">Run the integrity check</a></p></Card>}
        <Card title="Upload rules">
          {s.role === "super_admin" && policy ? <GenericForm fields={[{ name: "max_upload_mb", label: "Maximum file size (MB, 1 to 4)", help: "4 MB is the hosting limit for uploads through the app." }, { name: "extra_types", label: "Extra file types", help: "PDF, JPG and PNG are always allowed. Optional: webp, docx (comma separated)." }]} initial={{ max_upload_mb: String(policy.maxMb), extra_types: policy.allowed.filter((t) => ["webp", "docx"].includes(t)).join(",") }} url="/api/admin/settings/uploads" method="PUT" actions={[{ label: "Save upload rules", primary: true }]} success="Upload rules saved." /> : <p className="text-sm">Current limit: {policy ? `${policy.maxMb} MB; types: ${policy.allowed.join(", ")}` : "unavailable"}. Only a Super Admin can change this.</p>}
        </Card>
        <Card title="Operations policy">
          {s.role === "super_admin" && pol ? <GenericForm fields={[{ name: "readiness_windows", label: "Readiness windows (days before exam)", help: "Comma separated, e.g. 30,14,7,3,1" }, { name: "reimb_overdue_days", label: "Reimbursement overdue after (days since claim)" }]} initial={{ readiness_windows: pol.windows.join(","), reimb_overdue_days: String(pol.overdueDays) }} url="/api/admin/settings/policy" method="PUT" actions={[{ label: "Save policy", primary: true }]} success="Policy saved." /> : <p className="text-sm">{pol ? `Windows: ${pol.windows.join(", ")} days. Reimbursements overdue after ${pol.overdueDays} days.` : "Unavailable."} Only a Super Admin can change this.</p>}
        </Card>
        <Card title="Operations admin access">
          {s.role === "super_admin" ? (<div className="space-y-2"><p className="text-sm">Operations admins {fin ? "can" : "cannot"} view payment amounts and references.</p><ActionButton label={fin ? "Hide payment details from Operations" : "Allow Operations to view payment details"} url="/api/admin/settings" method="PUT" body={{ ops_can_view_financial: !fin }} /></div>) : <Notice>Only a Super Admin can change this.</Notice>}
        </Card>
      </div>
    </>
  );
}
