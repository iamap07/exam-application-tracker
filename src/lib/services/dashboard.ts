import "server-only";
import { SHEETS } from "@/lib/sheets/schema";
import { readMany, type Row } from "@/lib/sheets/store";
import { daysBetween, todayIST } from "@/lib/dates";
import { APP_STATUSES } from "@/lib/constants";

const names = [SHEETS.SME_Master, SHEETS.Exam_Master, SHEETS.Exam_Assignments, SHEETS.Application_Responses, SHEETS.Reimbursement_Tracker, SHEETS.Admit_Card_Tracker, SHEETS.Travel_Accommodation, SHEETS.Notifications, SHEETS.Document_Registry];
export async function loadAll() {
  const d = await readMany(names);
  return { smes: d.SME_Master, exams: d.Exam_Master, assignments: d.Exam_Assignments, apps: d.Application_Responses, reimb: d.Reimbursement_Tracker, admit: d.Admit_Card_Tracker, travel: d.Travel_Accommodation, notifications: d.Notifications, docs: d.Document_Registry };
}
export type Bundle = Awaited<ReturnType<typeof loadAll>>;

const PENDING_APP = ["Not Started", "In Progress", "Correction Required"];
const TRAVEL_PENDING = ["Pending Review", "Awaiting Approval", "Approved", "Booking in Progress"];
const ACC_PENDING = ["Pending Review", "Awaiting Approval", "Booking in Progress"];
const REIMB_DONE = ["Not Eligible", "Paid", "Rejected"];
const applied = (s: string) => ["Submitted", "Awaiting Verification", "Verified"].includes(s);
const count = (rows: Row[], f: (r: Row) => boolean) => rows.filter(f).length;

export interface Kpi { key: string; label: string; value: number; href: string }

export function smeDashboard(b: Bundle, smeId: string) {
  const today = todayIST();
  const me = b.smes.find((s) => s.sme_id === smeId)!;
  const asg = b.assignments.filter((a) => a.sme_id === smeId && a.assignment_status === "Active");
  const ids = new Set(asg.map((a) => a.assignment_id));
  const apps = b.apps.filter((a) => ids.has(a.assignment_id));
  const examOf = (id: string) => b.exams.find((e) => e.exam_id === id);
  const reimb = b.reimb.filter((r) => ids.has(r.assignment_id));
  const admitDone = new Set(b.docs.filter((d) => d.doc_type === "admit_card" && !["Superseded", "Rejected"].includes(d.verification_status)).map((d) => d.assignment_id));
  const travel = b.travel.filter((t) => ids.has(t.assignment_id));
  const upcoming = asg.filter((a) => (examOf(a.exam_id)?.exam_date ?? "") >= today && examOf(a.exam_id)?.exam_date);
  const kpis: Kpi[] = [
    { key: "assigned", label: "Exams assigned", value: asg.length, href: "/sme/exams" },
    { key: "unack", label: "Awaiting your acknowledgement", value: count(asg, (a) => a.ack_status !== "Acknowledged"), href: "/sme/exams?ack=Pending" },
    { key: "pending", label: "Applications pending", value: count(apps, (a) => PENDING_APP.includes(a.status)), href: "/sme/applications?group=pending" },
    { key: "submitted", label: "Applications submitted", value: count(apps, (a) => a.status === "Submitted"), href: "/sme/applications?status=Submitted" },
    { key: "verifying", label: "Under verification", value: count(apps, (a) => a.status === "Awaiting Verification"), href: "/sme/applications?status=Awaiting Verification" },
    { key: "approved", label: "Applications verified", value: count(apps, (a) => a.status === "Verified"), href: "/sme/applications?status=Verified" },
    { key: "rpend", label: "Reimbursement pending", value: count(reimb, (r) => !REIMB_DONE.includes(r.approval_status) && r.payment_status !== "Paid"), href: "/sme/applications" },
    { key: "rdone", label: "Reimbursement completed", value: count(reimb, (r) => r.payment_status === "Paid"), href: "/sme/applications" },
    { key: "admit", label: "Admit cards pending", value: count(asg, (a) => applied(apps.find((p) => p.assignment_id === a.assignment_id)?.status ?? "") && !admitDone.has(a.assignment_id)), href: "/sme/exams" },
    { key: "upcoming", label: "Upcoming exams", value: upcoming.length, href: "/sme/exams?when=upcoming" },
    { key: "travel", label: "Travel / accommodation pending", value: count(travel, (t) => TRAVEL_PENDING.includes(t.travel_status) || ACC_PENDING.includes(t.accommodation_status)), href: "/sme/exams" },
  ];
  const actions: { text: string; href: string; urgent?: boolean }[] = [];
  if (me.profile_complete !== "Yes") actions.push({ text: "Complete your profile", href: "/sme/profile" });
  for (const a of asg) {
    const ex = examOf(a.exam_id); const app = apps.find((p) => p.assignment_id === a.assignment_id); const name = ex?.name ?? a.exam_id;
    const href = `/sme/applications/${a.assignment_id}`;
    const left = a.deadline ? daysBetween(today, a.deadline) : null;
    if (a.ack_status !== "Acknowledged") actions.push({ text: `Acknowledge ${name}`, href: "/sme/exams" });
    if (app?.status === "Correction Required") actions.push({ text: `Correct your application for ${name}${app.correction_note ? ": " + app.correction_note : ""}`, href, urgent: true });
    else if (app && PENDING_APP.includes(app.status)) actions.push({ text: `${app.status === "Not Started" ? "Start" : "Finish"} your application for ${name}${left !== null ? (left < 0 ? " (deadline passed)" : ` (${left} day${left === 1 ? "" : "s"} left)`) : ""}`, href, urgent: left !== null && left <= 3 });
  }
  const live = (aid: string, t: string) => b.docs.some((d) => d.assignment_id === aid && d.doc_type === t && !["Superseded", "Rejected"].includes(d.verification_status));
  for (const a of asg) {
    const app = apps.find((p) => p.assignment_id === a.assignment_id); const name = examOf(a.exam_id)?.name ?? a.exam_id;
    if (app && !["Not Started", "Cancelled", "Rejected"].includes(app.status)) {
      if (!live(a.assignment_id, "application_form")) actions.push({ text: `Upload your application form for ${name}`, href: "/sme/documents" });
      if (!live(a.assignment_id, "payment_receipt") && Number(app.amount_paid) > 0) actions.push({ text: `Upload your payment receipt for ${name}`, href: "/sme/documents" });
    }
  }
  for (const d of b.docs.filter((x) => x.sme_id === smeId && x.verification_status === "Correction Required")) actions.push({ text: `Replace "${d.file_name}": ${d.admin_remarks}`, href: "/sme/documents", urgent: true });
  for (const a of asg) {
    const ex = examOf(a.exam_id); const app = apps.find((p) => p.assignment_id === a.assignment_id); const name = ex?.name ?? a.exam_id;
    const ad = b.admit.find((r) => r.assignment_id === a.assignment_id); const rm = reimb.find((r) => r.assignment_id === a.assignment_id); const tv = travel.find((t) => t.assignment_id === a.assignment_id);
    const isApplied = !!app && applied(app.status);
    const examIn = ex?.exam_date ? daysBetween(today, ex.exam_date) : null;
    const admitDue = (ex?.admit_card_expected && ex.admit_card_expected <= today) || (examIn !== null && examIn >= 0 && examIn <= 30);
    if (isApplied && admitDue && !admitDone.has(a.assignment_id)) actions.push({ text: `Upload your admit card for ${name}`, href: "/sme/admit-cards", urgent: examIn !== null && examIn <= 7 });
    if (ad?.verification_status === "Correction Required") actions.push({ text: `Correct your exam details for ${name}: ${ad.admin_remarks}`, href: "/sme/admit-cards", urgent: true });
    else if (isApplied && admitDone.has(a.assignment_id) && (!ad || ad.verification_status === "Not Submitted")) actions.push({ text: `Confirm exam date, reporting time and centre for ${name}`, href: "/sme/admit-cards" });
    if (rm?.approval_status === "Correction Required") actions.push({ text: `Correct your reimbursement claim for ${name}: ${rm.admin_remarks}`, href: "/sme/reimbursements", urgent: true });
    else if (rm && isApplied && ["Eligible — Not Applied", "Applied — Documents Pending"].includes(rm.approval_status)) actions.push({ text: `${rm.approval_status === "Eligible — Not Applied" ? "Apply for" : "Finish"} reimbursement for ${name}`, href: "/sme/reimbursements" });
    if (tv && (tv.travel_status === "Booked" || tv.accommodation_status === "Booked") && tv.sme_confirmed !== "Yes") actions.push({ text: `Confirm your travel/accommodation for ${name}`, href: "/sme/travel" });
  }
  actions.sort((x, y) => Number(!!y.urgent) - Number(!!x.urgent));
  const unread = b.notifications.filter((n) => n.recipient_sme_id === smeId && n.read_status === "Unread");
  const profileFields = ["mobile", "department", "designation", "emergency_contact", "employee_id"];
  const profilePct = Math.round((profileFields.filter((k) => me[k]).length / profileFields.length) * 100);
  const upcomingList = upcoming.map((a) => ({ a, ex: examOf(a.exam_id)!, app: apps.find((p) => p.assignment_id === a.assignment_id) })).sort((x, y) => x.ex.exam_date.localeCompare(y.ex.exam_date));
  return { me, kpis, actions, unread: unread.slice(0, 5), unreadCount: unread.length, profilePct, upcomingList };
}

export interface AdminFilters { exam_id?: string; department?: string; from?: string; to?: string }

export function adminDashboard(b: Bundle, f: AdminFilters) {
  const today = todayIST();
  const smeBy = new Map(b.smes.map((s) => [s.sme_id, s]));
  let asg = b.assignments.filter((a) => a.assignment_status === "Active");
  if (f.exam_id) asg = asg.filter((a) => a.exam_id === f.exam_id);
  if (f.department) asg = asg.filter((a) => smeBy.get(a.sme_id)?.department === f.department);
  if (f.from) asg = asg.filter((a) => a.assignment_date >= f.from!);
  if (f.to) asg = asg.filter((a) => a.assignment_date <= f.to!);
  const ids = new Set(asg.map((a) => a.assignment_id));
  const apps = b.apps.filter((a) => ids.has(a.assignment_id));
  const reimb = b.reimb.filter((r) => ids.has(r.assignment_id));
  const travel = b.travel.filter((t) => ids.has(t.assignment_id));
  const examBy = new Map(b.exams.map((e) => [e.exam_id, e]));
  const admitDone = new Set(b.docs.filter((d) => d.doc_type === "admit_card" && !["Superseded", "Rejected"].includes(d.verification_status)).map((d) => d.assignment_id));
  const q = (extra: string) => `/admin/applications?${extra}`;
  const kpis: Kpi[] = [
    { key: "smes", label: "Registered SMEs", value: b.smes.length, href: "/admin/smes" },
    { key: "active", label: "Active SMEs", value: count(b.smes, (s) => s.account_status === "Active"), href: "/admin/smes?account_status=Active" },
    { key: "exams", label: "Exams created", value: b.exams.length, href: "/admin/exams" },
    { key: "asg", label: "Active assignments", value: asg.length, href: "/admin/assignments?assignment_status=Active" },
    { key: "ns", label: "Applications not started", value: count(apps, (a) => a.status === "Not Started"), href: q("status=Not Started") },
    { key: "ip", label: "Applications in progress", value: count(apps, (a) => a.status === "In Progress"), href: q("status=In Progress") },
    { key: "sub", label: "Applications submitted", value: count(apps, (a) => a.status === "Submitted"), href: q("status=Submitted") },
    { key: "av", label: "Awaiting verification", value: count(apps, (a) => a.status === "Awaiting Verification"), href: q("status=Awaiting Verification") },
    { key: "cr", label: "Requiring correction", value: count(apps, (a) => a.status === "Correction Required"), href: q("status=Correction Required") },
    { key: "ver", label: "Verified", value: count(apps, (a) => a.status === "Verified"), href: q("status=Verified") },
    { key: "missdocs", label: "Applications missing documents", value: count(apps, (a) => applied(a.status) && !(["application_form", "payment_receipt"].every((t) => b.docs.some((d) => d.assignment_id === a.assignment_id && d.doc_type === t && !["Superseded", "Rejected"].includes(d.verification_status))) || Number(a.amount_paid) === 0 && b.docs.some((d) => d.assignment_id === a.assignment_id && d.doc_type === "application_form" && !["Superseded", "Rejected"].includes(d.verification_status)))), href: "/admin/documents" },
    { key: "rna", label: "Reimbursement not applied", value: count(reimb, (r) => r.approval_status === "Eligible — Not Applied"), href: "/admin/assignments" },
    { key: "rpa", label: "Reimbursement pending approval", value: count(reimb, (r) => ["Submitted for Approval", "Under Review"].includes(r.approval_status)), href: "/admin/assignments" },
    { key: "rpaid", label: "Reimbursement paid", value: count(reimb, (r) => r.payment_status === "Paid"), href: "/admin/assignments" },
    { key: "admit", label: "Admit cards pending", value: count(asg, (a) => applied(apps.find((p) => p.assignment_id === a.assignment_id)?.status ?? "") && !admitDone.has(a.assignment_id)), href: "/admin/assignments" },
    { key: "unv", label: "Exam details awaiting verification", value: count(b.admit.filter((r) => ids.has(r.assignment_id)), (r) => r.verification_status === "Pending Verification"), href: "/admin/admit-cards?status=Pending Verification" },
    { key: "upc", label: "Upcoming exams", value: count(b.exams, (e) => !!e.exam_date && e.exam_date >= today && e.status !== "Cancelled"), href: "/admin/exams?when=upcoming" },
    { key: "tp", label: "Travel arrangements pending", value: count(travel, (t) => TRAVEL_PENDING.includes(t.travel_status)), href: "/admin/assignments" },
    { key: "ap", label: "Accommodation pending", value: count(travel, (t) => ACC_PENDING.includes(t.accommodation_status)), href: "/admin/assignments" },
  ];
  const completion = (a: Row[]) => (a.length ? Math.round((count(a, (x) => applied(x.status)) / a.length) * 100) : 0);
  const byExam = [...new Set(asg.map((a) => a.exam_id))].map((id) => {
    const rows = apps.filter((p) => p.exam_id === id);
    return { label: examBy.get(id)?.name ?? id, value: completion(rows), detail: `${count(rows, (x) => applied(x.status))}/${rows.length}` };
  });
  const bySme = [...new Set(asg.map((a) => a.sme_id))].map((id) => {
    const rows = apps.filter((p) => p.sme_id === id);
    return { label: smeBy.get(id)?.full_name ?? id, value: completion(rows), detail: `${count(rows, (x) => applied(x.status))}/${rows.length}` };
  }).sort((a, b2) => a.value - b2.value).slice(0, 10);
  const statusDist = APP_STATUSES.map((s) => ({ label: s, value: count(apps, (a) => a.status === s), detail: "" })).filter((x) => x.value > 0);
  const months = new Map<string, number>();
  for (const e of b.exams) if (e.exam_date) months.set(e.exam_date.slice(0, 7), (months.get(e.exam_date.slice(0, 7)) ?? 0) + 1);
  const monthly = [...months.entries()].sort().map(([label, value]) => ({ label, value, detail: "" }));
  const overdue = asg.filter((a) => a.deadline && a.deadline < today && ["Not Started", "In Progress", "Correction Required"].includes(apps.find((p) => p.assignment_id === a.assignment_id)?.status ?? "")).length;
  const deadlines = asg.filter((a) => a.deadline && a.deadline >= today && ["Not Started", "In Progress", "Correction Required"].includes(apps.find((p) => p.assignment_id === a.assignment_id)?.status ?? "")).reduce((m, a) => m.set(a.deadline, (m.get(a.deadline) ?? 0) + 1), new Map<string, number>());
  const pendingByDeadline = [...deadlines.entries()].sort().slice(0, 10).map(([label, value]) => ({ label, value, detail: "" }));
  const upcoming = b.exams.filter((e) => e.exam_date >= today && e.status !== "Cancelled").sort((x, y) => x.exam_date.localeCompare(y.exam_date)).slice(0, 8);
  const overall = completion(apps);
  return { kpis, byExam, bySme, statusDist, monthly, pendingByDeadline, upcoming, overdue, overall, departments: [...new Set(b.smes.map((s) => s.department).filter(Boolean))].sort() };
}
