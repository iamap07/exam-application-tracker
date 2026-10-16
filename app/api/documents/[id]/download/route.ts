import { requireRole } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { fetchDocument } from "@/lib/services/documents";

export const runtime = "nodejs";

// Files are never public: every download is authorised here, then proxied from Drive.
export const GET = route(async (req, ctx) => {
  const s = await requireRole("sme", "ops_admin", "super_admin");
  const { id } = await ctx.params;
  const { doc, bytes } = await fetchDocument(s, id);
  const inlineOk = new URL(req.url).searchParams.get("inline") === "1" && doc.mime_type !== "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const safeName = doc.file_name.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(new Uint8Array(bytes), { headers: {
    "Content-Type": doc.mime_type, "Content-Length": String(bytes.length),
    "Content-Disposition": `${inlineOk ? "inline" : "attachment"}; filename="${safeName}"`,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    ...(doc.mime_type.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
  } });
});
