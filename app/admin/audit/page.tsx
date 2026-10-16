import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { SHEETS } from "@/lib/sheets/schema";
import { readAll } from "@/lib/sheets/store";
import { applyTable, parseQuery } from "@/lib/table";
import { Badge, DataTable, FilterBar, PageHeader } from "@/components/ui";

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole("super_admin").catch(() => redirect("/admin"));
  const sp = await searchParams;
  const { rows } = await readAll(SHEETS.Audit_Log);
  const q = parseQuery({ sort: "timestamp", dir: "desc", ...sp }, ["outcome", "entity"]);
  const t = applyTable(rows, q, ["actor_id", "action", "entity_id"]);
  return (
    <>
      <PageHeader title="Audit logs" sub="Every change is recorded with who, what and when." />
      <FilterBar sp={sp} filters={[{ key: "outcome", label: "Outcome", options: ["success", "failure"] }, { key: "entity", label: "Entity", options: [...new Set(rows.map((r) => r.entity))] }]} />
      <DataTable sp={sp} {...t} empty="No audit entries yet." cols={[
        { key: "timestamp", label: "When", sortable: true, render: (r) => r.timestamp.replace("T", " ").slice(0, 19) }, { key: "actor_id", label: "Actor", sortable: true }, { key: "actor_role", label: "Role" },
        { key: "action", label: "Action", sortable: true }, { key: "entity_id", label: "Record" }, { key: "outcome", label: "Outcome", render: (r) => <Badge>{r.outcome === "success" ? "Yes" : "Failed"}</Badge> },
      ]} />
    </>
  );
}
