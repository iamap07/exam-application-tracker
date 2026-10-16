export interface TableQuery { q: string; sort: string; dir: "asc" | "desc"; page: number; pageSize: number; filters: Record<string, string> }
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseQuery(sp: SP, filterKeys: string[] = []): TableQuery {
  const page = Math.max(1, parseInt(one(sp.page)) || 1);
  return {
    q: one(sp.q).slice(0, 100), sort: one(sp.sort), dir: one(sp.dir) === "desc" ? "desc" : "asc", page,
    pageSize: Math.min(100, Math.max(5, parseInt(one(sp.pageSize)) || 20)),
    filters: Object.fromEntries(filterKeys.map((k) => [k, one(sp[k])]).filter(([, v]) => v)),
  };
}

export function applyTable(rows: Record<string, string>[], qy: TableQuery, searchKeys: string[]) {
  let out = rows;
  for (const [k, v] of Object.entries(qy.filters)) out = out.filter((r) => r[k] === v);
  if (qy.q) { const n = qy.q.toLowerCase(); out = out.filter((r) => searchKeys.some((k) => (r[k] ?? "").toLowerCase().includes(n))); }
  if (qy.sort) {
    const k = qy.sort, m = qy.dir === "desc" ? -1 : 1;
    out = [...out].sort((a, b) => (a[k] ?? "").localeCompare(b[k] ?? "", undefined, { numeric: true }) * m);
  }
  const total = out.length, pages = Math.max(1, Math.ceil(total / qy.pageSize));
  const page = Math.min(qy.page, pages);
  return { rows: out.slice((page - 1) * qy.pageSize, page * qy.pageSize), total, page, pages };
}
