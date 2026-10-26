import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import Shell from "@/components/Shell";

export default async function SmeLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s) redirect("/login?error=noaccess");
  if (s.role !== "sme") redirect("/admin");
  const nav = [{ href: "/sme", label: "My Dashboard" }, { href: "/sme/exams", label: "My Exams" }, { href: "/sme/applications", label: "My Applications" }, { href: "/sme/documents", label: "My Documents" }, { href: "/sme/reimbursements", label: "My Reimbursements" }, { href: "/sme/admit-cards", label: "My Admit Cards" }, { href: "/sme/travel", label: "My Travel & Accommodation" }, { href: "/sme/notifications", label: "Notifications" }, { href: "/sme/profile", label: "My Profile" }];
  return <Shell title="My Exams" email={s.email} role="SME" nav={nav}>{children}</Shell>;
}
