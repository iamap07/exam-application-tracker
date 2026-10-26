import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import Shell from "@/components/Shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login?error=noaccess");
  if (s.role === "sme") redirect("/sme");
  const nav = [{ href: "/admin", label: "Overview" }, { href: "/admin/smes", label: "SMEs" }, { href: "/admin/exams", label: "Examinations" }, { href: "/admin/assignments", label: "Assignments" }, { href: "/admin/applications", label: "Applications" }, { href: "/admin/documents", label: "Documents" }, { href: "/admin/reimbursements", label: "Reimbursements" }, { href: "/admin/admit-cards", label: "Admit Cards" }, { href: "/admin/travel", label: "Travel & Accommodation" }, { href: "/admin/readiness", label: "Readiness" }, { href: "/admin/notifications", label: "Notifications" }, ...(s.role === "super_admin" ? [{ href: "/admin/audit", label: "Audit logs" }] : []), { href: "/admin/settings", label: "Settings" }];
  return <Shell title="Exam Tracker" email={s.email} role={s.role} nav={nav}>{children}</Shell>;
}
