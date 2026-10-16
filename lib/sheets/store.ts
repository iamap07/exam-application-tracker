import "server-only";
import { getGoogle } from "@/lib/google/client";
import { requireEnv } from "@/lib/env";
import { withRetry } from "./retry";
import { SHEETS, SCHEMA_VERSION, type SheetDef } from "./schema";

export type Row = Record<string, string>;

function colLetter(n: number): string { // 1-based
  let s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const sid = () => requireEnv().GOOGLE_SHEETS_SPREADSHEET_ID;

/** Per-sheet in-process write queue. Sheets has no transactions; this serialises writes per instance,
 *  and updateById adds optimistic version checks to guard against cross-instance races. */
const queues = new Map<string, Promise<unknown>>();
function serialise<T>(sheet: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(sheet) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  queues.set(sheet, next);
  return next;
}

// Prevent CSV/Sheets formula injection on user-supplied strings.
function sanitizeCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export interface SchemaReport { sheet: string; status: "ok" | "created" | "headers_written" | "mismatch"; detail?: string }

/** Create missing tabs and headers. Never overwrites a tab whose headers differ; reports mismatch instead. */
export async function ensureSchema(): Promise<SchemaReport[]> {
  const { sheets } = getGoogle();
  const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId: sid() }));
  const existing = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
  const missing = Object.values(SHEETS).filter((d) => !existing.has(d.name));
  if (missing.length) {
    await withRetry(() => sheets.spreadsheets.batchUpdate({
      spreadsheetId: sid(),
      requestBody: { requests: missing.map((d) => ({ addSheet: { properties: { title: d.name, gridProperties: { frozenRowCount: 1 } } } })) },
    }));
  }
  const reports: SchemaReport[] = [];
  for (const def of Object.values(SHEETS)) {
    const range = `${def.name}!1:1`;
    const res = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: sid(), range }));
    const found = (res.data.values?.[0] ?? []) as string[];
    if (found.length === 0) {
      await withRetry(() => sheets.spreadsheets.values.update({
        spreadsheetId: sid(), range: `${def.name}!A1`, valueInputOption: "RAW", requestBody: { values: [def.headers] },
      }));
      reports.push({ sheet: def.name, status: missing.some((m) => m.name === def.name) ? "created" : "headers_written" });
    } else if (JSON.stringify(found) !== JSON.stringify(def.headers)) {
      reports.push({ sheet: def.name, status: "mismatch", detail: `Expected ${def.headers.length} headers, found ${found.length}. Fix manually or add a migration.` });
    } else reports.push({ sheet: def.name, status: "ok" });
  }
  await setConfig("schema_version", String(SCHEMA_VERSION), "system");
  return reports;
}

export async function readAll(def: SheetDef): Promise<{ rows: Row[]; rowNumbers: number[] }> {
  const { sheets } = getGoogle();
  const res = await withRetry(() => sheets.spreadsheets.values.get({ spreadsheetId: sid(), range: def.name }));
  const [header, ...data] = (res.data.values ?? []) as string[][];
  if (!header || JSON.stringify(header) !== JSON.stringify(def.headers)) {
    throw new Error(`Header mismatch in ${def.name}. Run schema initialisation and resolve differences.`);
  }
  const rows: Row[] = []; const rowNumbers: number[] = [];
  data.forEach((r, i) => {
    if (r.every((c) => !c)) return;
    rows.push(Object.fromEntries(def.headers.map((h, j) => [h, r[j] ?? ""])));
    rowNumbers.push(i + 2); // transient: only used inside a single operation, never stored
  });
  return { rows, rowNumbers };
}

export async function findById(def: SheetDef, id: string): Promise<Row | null> {
  const { rows } = await readAll(def);
  return rows.find((r) => r[def.idColumn] === id) ?? null;
}

export async function query(def: SheetDef, predicate: (r: Row) => boolean): Promise<Row[]> {
  return (await readAll(def)).rows.filter(predicate);
}

export class DuplicateError extends Error {}
export class ConflictError extends Error {}
export class NotFoundError extends Error {}

export function insert(def: SheetDef, record: Row): Promise<Row> {
  return serialise(def.name, async () => {
    const { rows } = await readAll(def);
    if (record[def.idColumn] && rows.some((r) => r[def.idColumn] === record[def.idColumn])) {
      throw new DuplicateError(`${def.name} already has ${def.idColumn}=${record[def.idColumn]}`);
    }
    for (const key of def.uniqueKeys ?? []) {
      if (rows.some((r) => key.every((k) => r[k].toLowerCase() === (record[k] ?? "").toLowerCase() && r[k] !== ""))) {
        throw new DuplicateError(`Duplicate ${def.name} record for ${key.join("+")}`);
      }
    }
    const now = new Date().toISOString();
    const full: Row = { ...Object.fromEntries(def.headers.map((h) => [h, ""])), created_at: now, updated_at: now, ...record };
    const { sheets } = getGoogle();
    await withRetry(() => sheets.spreadsheets.values.append({
      spreadsheetId: sid(), range: def.name, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS",
      requestBody: { values: [def.headers.map((h) => sanitizeCell(full[h]))] },
    }));
    // Read-back verification: never report success for a write that is not visible.
    const check = await findById(def, full[def.idColumn]);
    if (!check) throw new Error(`Write to ${def.name} could not be verified`);
    return check;
  });
}

/** Update by stable ID. Pass expectedUpdatedAt to reject stale writes (optimistic concurrency). */
export function updateById(def: SheetDef, id: string, patch: Partial<Row>, opts: { expectedUpdatedAt?: string; actor?: string } = {}): Promise<Row> {
  return serialise(def.name, async () => {
    const { rows, rowNumbers } = await readAll(def); // fresh read every time; row number never cached
    const idx = rows.findIndex((r) => r[def.idColumn] === id);
    if (idx < 0) throw new NotFoundError(`${def.name} ${id} not found`);
    const current = rows[idx];
    if (opts.expectedUpdatedAt && current.updated_at !== opts.expectedUpdatedAt) {
      throw new ConflictError(`${def.name} ${id} was changed by someone else. Reload and retry.`);
    }
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Row; // undefined means "leave unchanged"
    // updated_at doubles as the row version for optimistic concurrency, so every update MUST produce a strictly newer value
    // (two writes inside the same millisecond would otherwise leave a stale writer's check passing).
    let stamp = new Date().toISOString();
    if (current.updated_at && stamp <= current.updated_at) stamp = new Date(Date.parse(current.updated_at) + 1).toISOString();
    const next: Row = { ...current, ...defined, [def.idColumn]: id, updated_at: stamp };
    if (opts.actor && "updated_by" in next) next.updated_by = opts.actor;
    const rowNo = rowNumbers[idx];
    const { sheets } = getGoogle();
    await withRetry(() => sheets.spreadsheets.values.update({
      spreadsheetId: sid(), range: `${def.name}!A${rowNo}:${colLetter(def.headers.length)}${rowNo}`,
      valueInputOption: "RAW", requestBody: { values: [def.headers.map((h) => sanitizeCell(next[h]))] },
    }));
    const check = await findById(def, id);
    if (!check || check.updated_at !== next.updated_at) throw new Error(`Update to ${def.name} ${id} could not be verified`);
    return check;
  });
}

export async function getConfig(key: string): Promise<string | null> {
  const r = await findById(SHEETS.System_Config, key);
  return r ? r.value : null;
}
export async function setConfig(key: string, value: string, actor: string) {
  const def = SHEETS.System_Config;
  const existing = await findById(def, key);
  if (existing) return updateById(def, key, { value, updated_by: actor });
  return insert(def, { key, value, updated_by: actor });
}

/** One API call for several tabs (keeps within Sheets read quota). Validates headers for each tab. */
export async function readMany(defs: SheetDef[]): Promise<Record<string, Row[]>> {
  const { sheets } = getGoogle();
  const res = await withRetry(() => sheets.spreadsheets.values.batchGet({ spreadsheetId: sid(), ranges: defs.map((d) => d.name) }));
  const out: Record<string, Row[]> = {};
  defs.forEach((def, i) => {
    const [header, ...data] = (res.data.valueRanges?.[i]?.values ?? []) as string[][];
    if (!header || JSON.stringify(header) !== JSON.stringify(def.headers)) throw new Error(`Header mismatch in ${def.name}. Run schema initialisation.`);
    out[def.name] = data.filter((r) => r.some((c) => c)).map((r) => Object.fromEntries(def.headers.map((h, j) => [h, r[j] ?? ""])));
  });
  return out;
}

export async function checkSheetsHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { sheets } = getGoogle();
    const meta = await withRetry(() => sheets.spreadsheets.get({ spreadsheetId: sid() }));
    const have = new Set((meta.data.sheets ?? []).map((s) => s.properties?.title));
    const missing = Object.keys(SHEETS).filter((n) => !have.has(n));
    return missing.length ? { ok: false, detail: `Missing tabs: ${missing.join(", ")}. Run schema initialisation.` } : { ok: true, detail: "All tabs present" };
  } catch (e) {
    return { ok: false, detail: "Cannot reach the spreadsheet. Check the ID and that it is shared with the service account." };
  }
}

/** Write-only append for log-style tabs (no read, no uniqueness check, no read-back). Saves Sheets quota on high-volume tabs. */
export async function append(def: SheetDef, record: Row): Promise<void> {
  const now = new Date().toISOString();
  const full: Row = { ...Object.fromEntries(def.headers.map((h) => [h, ""])), created_at: now, updated_at: now, ...record };
  const { sheets } = getGoogle();
  await withRetry(() => sheets.spreadsheets.values.append({ spreadsheetId: sid(), range: def.name, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: [def.headers.map((h) => sanitizeCell(full[h]))] } }));
}
