import { sheetsState as S } from "./state";

const httpErr = (status: number) => Object.assign(new Error(`fake google error ${status}`), { response: { status } });
const maybeFail = () => { if (S.failNext && S.failNext.times > 0) { S.failNext.times--; throw httpErr(S.failNext.status); } };
const trim = (row: string[]) => { const r = [...row]; while (r.length && r[r.length - 1] === "") r.pop(); return r; };

function parse(range: string) {
  const [tab, rest] = range.split("!");
  if (!rest) return { tab };
  const m = rest.match(/^([A-Z]*)(\d+)(?::([A-Z]*)(\d+))?$/);
  if (!m) throw httpErr(400);
  return { tab, start: Number(m[2]), end: Number(m[4] ?? m[2]) };
}
function read(range: string): string[][] | undefined {
  const p = parse(range);
  const rows = S.tabs.get(p.tab); if (!rows) throw httpErr(400);
  const slice = p.start ? rows.slice(p.start - 1, p.end) : rows;
  const out = slice.map(trim).map((r) => [...r]);
  while (out.length && out[out.length - 1].length === 0) out.pop();
  return out.length ? out : undefined;
}

const sheets = {
  spreadsheets: {
    get: async () => { maybeFail(); return { data: { sheets: [...S.tabs.keys()].map((title) => ({ properties: { title } })) } }; },
    batchUpdate: async ({ requestBody }: { requestBody: { requests: { addSheet: { properties: { title: string } } }[] } }) => { maybeFail(); for (const r of requestBody.requests) if (!S.tabs.has(r.addSheet.properties.title)) S.tabs.set(r.addSheet.properties.title, []); return { data: {} }; },
    values: {
      get: async ({ range }: { range: string }) => { maybeFail(); return { data: { values: read(range) } }; },
      batchGet: async ({ ranges }: { ranges: string[] }) => { maybeFail(); if (S.batchGetFail) throw httpErr(400); return { data: { valueRanges: ranges.map((r) => ({ values: read(r) })) } }; },
      update: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
        maybeFail(); const p = parse(range); const rows = S.tabs.get(p.tab); if (!rows) throw httpErr(400);
        while (rows.length < (p.start ?? 1)) rows.push([]);
        rows[(p.start ?? 1) - 1] = [...requestBody.values[0]]; return { data: {} };
      },
      append: async ({ range, requestBody }: { range: string; requestBody: { values: string[][] } }) => {
        maybeFail(); const rows = S.tabs.get(range); if (!rows) throw httpErr(400);
        if (S.failAppend && S.failAppend.tab === range && S.failAppend.times > 0) { S.failAppend.times--; throw httpErr(400); }
        if (!S.dropAppends) for (const v of requestBody.values) rows.push([...v]);
        return { data: {} };
      },
    },
  },
};
export const getGoogle = () => ({ sheets, drive: null });
