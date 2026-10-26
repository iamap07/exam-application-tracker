import { requireAdmin } from "@/lib/auth/session";
import { SHEETS } from "@/lib/sheets/schema";
import { getConfig, readAll } from "@/lib/sheets/store";
import { integrationStatus } from "@/lib/services/jobs";
import { parseReminderConfig, toFlat } from "@/lib/reminders";
import { applyTable, parseQuery } from "@/lib/table";
import { Badge, Card, DataTable, FilterBar, Notice, PageHeader } from "@/components/ui";
import RunButton from "@/components/client/RunButton";
import NotifyForm from "@/components/client/NotifyForm";
import GenericForm, { type FieldDef } from "@/components/client/GenericForm";

const yn = ["Yes", "No"];
const F = (name: string, label: string, help?: string): FieldDef => ({ name, label, help });
const E = (name: string, label: string): FieldDef => ({ name, label, type: "select", options: yn });
const RULE_FIELDS: FieldDef[] = [
  E("ack_enabled", "Not-acknowledged reminders"), F("ack_after_days", "Start after (days since assignment)"), F("ack_every_days", "Repeat every (days)"), F("ack_max", "Maximum reminders"),
  E("deadline_enabled", "Deadline reminders"), F("deadline_days", "Days before deadline", "e.g. 7,3,1,0"),
  E("incomplete_enabled", "Application-not-submitted reminders"), F("incomplete_after_days", "Start after (days since assignment)"), F("incomplete_every_days", "Repeat every (days)"), F("incomplete_max", "Maximum reminders"),
  E("reimb_enabled", "Reimbursement-documents reminders"), F("reimb_after_days", "Start after (days since last change)"), F("reimb_every_days", "Repeat every (days)"), F("reimb_max", "Maximum reminders"),
  E("admit_enabled", "Admit-card reminders"), F("admit_days", "Days before exam", "e.g. 14,7,3,1"),
  E("details_enabled", "Exam-details-unverified reminders"), F("details_days", "Days before exam", "e.g. 7,3,1"),
  E("travel_enabled", "Confirm-travel reminders"), F("travel_every_days", "Repeat every (days)"), F("travel_max", "Maximum reminders"),
];

export default async function NotificationCentre({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireAdmin();
  const sp = await searchParams;
  const [{ rows: ntf }, { rows: smes }, { rows: exams }, st, cfgRaw] = await Promise.all([readAll(SHEETS.Notifications), readAll(SHEETS.SME_Master), readAll(SHEETS.Exam_Master), integrationStatus(), getConfig("reminder_config")]);
  const smeBy = new Map(smes.map((x) => [x.sme_id, x]));
  const rows = ntf.map((n) => ({ ...n, sme_name: smeBy.get(n.recipient_sme_id)?.full_name ?? n.recipient_sme_id }));
  const t = applyTable(rows, parseQuery({ sort: "created_at", dir: "desc", ...sp }, ["email_delivery_status", "type", "read_status"]), ["sme_name", "subject", "type"]);
  const count = (x: string) => ntf.filter((n) => n.email_delivery_status === x).length;
  const failed = count("Failed"), skipped = count("Skipped"), pending = count("Pending") + count("Sending");
  const cfg = toFlat(parseReminderConfig(cfgRaw));
  return (
    <>
      <PageHeader title="Notifications" sub="In-app notifications are created instantly. Emails are sent by the background job." />
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="Email"><div className="space-y-2 text-sm">
          <p><Badge>{st.emailConfigured ? "Yes" : "Failed"}</Badge> {st.emailConfigured ? "Provider keys are set." : "RESEND_API_KEY / EMAIL_FROM are not set. Nothing is being emailed."}</p>
          <p>{st.emailTest ? (<><Badge>{st.emailTest.ok ? "Yes" : "Failed"}</Badge> Last test {st.emailTest.at.slice(0, 16).replace("T", " ")}{st.emailTest.error ? `: ${st.emailTest.error}` : ""}</>) : <><Badge>Pending</Badge> No test email sent yet.</>}</p>
          <RunButton label="Send a test email to me" url="/api/admin/notifications/test" />
        </div></Card>
        <Card title="Scheduler"><div className="space-y-2 text-sm">
          <p><Badge>{st.scheduler.verified ? "Yes" : "Pending"}</Badge> {st.scheduler.verified ? `Scheduled run confirmed ${st.scheduler.lastCronAt?.slice(0, 16).replace("T", " ")}.` : "Not verified: no successful scheduled run in the last 36 hours. Check Vercel > Cron Jobs and CRON_SECRET. Manual runs do not count."}</p>
          <RunButton label="Run reminder job now" url="/api/admin/notifications/run" body={{ job: "reminders" }} confirm="Create due reminders and send emails now?" />
        </div></Card>
        <Card title="Delivery queue"><div className="space-y-2 text-sm">
          <p>{pending} waiting · {failed} failed · {skipped} skipped</p>
          <RunButton label="Send waiting emails now" url="/api/admin/notifications/run" body={{ job: "deliver" }} />
          {(failed > 0 || skipped > 0) && <RunButton label="Retry failed and skipped" variant="secondary" url="/api/admin/notifications/retry" body={{}} />}
        </div></Card>
      </div>
      <Card title="Send a notification" className="mb-6"><NotifyForm smes={smes.filter((x) => x.account_status !== "Deactivated").map((x) => ({ sme_id: x.sme_id, full_name: x.full_name, department: x.department }))} exams={exams.map((x) => ({ exam_id: x.exam_id, name: x.name }))} /></Card>
      {s.role === "super_admin" && <details className="mb-6 rounded-lg border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Reminder rules</summary><div className="mt-4"><p className="mb-3 text-sm text-slate-600">Each reminder is created once per rule, assignment and schedule step, so repeated job runs never duplicate it.</p><GenericForm fields={RULE_FIELDS} initial={cfg} url="/api/admin/settings/reminders" method="PUT" actions={[{ label: "Save reminder rules", primary: true }]} success="Reminder rules saved." /></div></details>}
      <h2 className="mb-2 text-sm font-semibold">Notification history</h2>
      <FilterBar sp={sp} filters={[{ key: "email_delivery_status", label: "Email", options: ["Pending", "Sending", "Sent", "Failed", "Skipped"] }, { key: "read_status", label: "Read", options: ["Unread", "Read"] }, { key: "type", label: "Type", options: [...new Set(ntf.map((n) => n.type))].sort() }]} />
      <DataTable sp={sp} {...t} empty="No notifications yet." cols={[
        { key: "created_at", label: "Created", sortable: true, render: (r) => r.created_at.slice(0, 16).replace("T", " ") }, { key: "sme_name", label: "Recipient", sortable: true },
        { key: "subject", label: "Subject", render: (r) => <div><div>{r.subject}</div><div className="text-xs text-slate-500">{r.type}</div></div> },
        { key: "read_status", label: "In-app", render: (r) => <Badge>{r.read_status}</Badge> },
        { key: "email_delivery_status", label: "Email", render: (r) => <div><Badge>{r.email_delivery_status}</Badge>{r.delivery_error && <div className="mt-1 max-w-56 text-xs text-rose-800">{r.delivery_error}</div>}</div> },
        { key: "email_attempts", label: "Tries" },
      ]} />
      <Card title="Recent job runs" className="mt-6">{st.runs.length === 0 ? <p className="text-sm text-slate-500">No runs recorded yet.</p> : <ul className="space-y-2 text-sm">{st.runs.map((r) => <li key={r.log_id} className="flex flex-wrap gap-2"><span className="tabular-nums text-slate-500">{r.run_at.slice(0, 16).replace("T", " ")}</span><Badge>{r.channel === "job:cron" ? "Scheduled" : "Manual"}</Badge><span className="font-medium">{r.rule}</span><Badge>{r.status === "ok" ? "Yes" : r.status === "partial" ? "Pending" : "Failed"}</Badge><span className="text-slate-600">{r.error}</span></li>)}</ul>}</Card>
    </>
  );
}
