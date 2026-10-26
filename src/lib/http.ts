import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";
import { ConflictError, DuplicateError, NotFoundError } from "@/lib/sheets/store";
import { createLimiter } from "@/lib/ratelimit";
import { redact } from "@/lib/redact";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}
type Ctx = { params: Promise<Record<string, string>> };

// Generous per-IP limits (offices share one IP). Uploads are the most expensive operation.
const limiters = { read: createLimiter(600, 60_000), write: createLimiter(120, 60_000), upload: createLimiter(30, 60_000) };
const clientIp = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

/** Wraps a handler: rate-limits, maps known errors to safe responses, never leaks internals. */
export function route(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const path = new URL(req.url).pathname;
    const kind = path === "/api/documents" && req.method === "POST" ? "upload" : req.method === "GET" || req.method === "HEAD" ? "read" : "write";
    const rl = limiters[kind].check(`${kind}:${clientIp(req)}`);
    if (!rl.ok) return NextResponse.json({ ok: false, error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
    try { return await fn(req, ctx); }
    catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      if (e instanceof HttpError) return NextResponse.json({ ok: false, error: e.message, ...e.extra }, { status: e.status });
      if (e instanceof ZodError) {
        const fields = Object.fromEntries(e.issues.map((i) => [i.path.join(".") || "_", i.message]));
        return NextResponse.json({ ok: false, error: "Some fields need attention.", fields }, { status: 400 });
      }
      if (e instanceof DuplicateError) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
      if (e instanceof ConflictError) return NextResponse.json({ ok: false, error: e.message }, { status: 409 });
      if (e instanceof NotFoundError) return NextResponse.json({ ok: false, error: "Record not found." }, { status: 404 });
      console.error("Unhandled API error:", redact((e as Error).message ?? String(e)));
      return NextResponse.json({ ok: false, error: "The change was not saved. Try again; if it keeps failing, check Settings > Integration health." }, { status: 500 });
    }
  };
}
const MAX_JSON_BYTES = 200_000;
export const readJson = async (req: Request) => {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_JSON_BYTES) throw new HttpError(413, "Request is too large.");
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new HttpError(413, "Request is too large.");
  try { return JSON.parse(text); } catch { throw new HttpError(400, "Request body must be valid JSON."); }
};
export const safeMessage = (e: unknown) => redact(e instanceof Error ? e.message : "Unknown error");
