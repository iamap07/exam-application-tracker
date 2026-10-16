export async function api(url: string, method: string, body?: unknown) {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    let data: any = {}; try { data = await r.json(); } catch { /* non-JSON */ }
    return { ok: r.ok && data.ok !== false, status: r.status, data };
  } catch { return { ok: false, status: 0, data: { error: "Network error. Check your connection and try again." } }; }
}
