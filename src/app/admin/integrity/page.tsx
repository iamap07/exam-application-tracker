import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { loadAll } from "@/lib/services/dashboard";
import { checkIntegrity } from "@/lib/integrity";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";

export default async function Integrity() {
  await requireRole("super_admin").catch(() => redirect("/admin"));
  const b = await loadAll();
  const issues = checkIntegrity(b);
  const errors = issues.filter((i) => i.severity === "error");
  return (
    <>
      <PageHeader title="Data integrity" sub="Google Sheets has no foreign keys, so this check looks for orphaned or inconsistent records. It only reads; it never changes data." />
      {issues.length === 0 ? <Notice kind="success">No problems found across {b.smes.length} SMEs, {b.exams.length} exams, {b.assignments.length} assignments and {b.docs.length} documents.</Notice> : (
        <Card title={`${errors.length} error(s), ${issues.length - errors.length} warning(s)`}><ul className="divide-y divide-slate-100 text-sm">{issues.map((i, n) => <li key={n} className="flex flex-wrap items-center gap-2 py-2"><Badge>{i.severity === "error" ? "Failed" : "Pending"}</Badge><span className="font-mono text-xs text-slate-500">{i.code}</span><span>{i.message}</span></li>)}</ul></Card>)}
    </>
  );
}
