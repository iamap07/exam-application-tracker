import { NextResponse } from "next/server";
import { requireRole, assertOwnership } from "@/lib/auth/session";
import { HttpError, route } from "@/lib/http";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, updateById } from "@/lib/sheets/store";

export const POST = route(async (_req, ctx) => {
  const s = await requireRole("sme");
  const { id } = await ctx.params;
  const n = await findById(SHEETS.Notifications, id);
  if (!n) throw new HttpError(404, "Notification not found.");
  assertOwnership(s, { sme_id: n.recipient_sme_id });
  if (n.read_status !== "Read") await updateById(SHEETS.Notifications, id, { read_status: "Read" }, { actor: s.email });
  return NextResponse.json({ ok: true });
});
