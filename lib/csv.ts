/** RFC4180 CSV with formula-injection protection (prefixes risky cells with an apostrophe). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: string[], rows: Record<string, string>[]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\r\n");
}
