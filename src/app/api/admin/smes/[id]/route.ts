import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { HttpError, route, readJson } from "@/lib/http";
import { resendInvite, setSmeActive, updateSmeByAdmin } from "@/lib/services/smes";

const body = z.object({ action: z.enum(["update", "deactivate", "reactivate", "resend_invite"]), data: z.unknown().optional(), expected_updated_at: z.string().optional() });

export const PATCH = route(async (req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  const b = body.parse(await readJson(req));
  switch (b.action) {
    case "update": return NextResponse.json({ ok: true, sme: await updateSmeByAdmin(s, id, b.data ?? {}, b.expected_updated_at) });
    case "deactivate": return NextResponse.json({ ok: true, sme: await setSmeActive(s, id, false) });
    case "reactivate": return NextResponse.json({ ok: true, sme: await setSmeActive(s, id, true) });
    case "resend_invite": return NextResponse.json({ ok: true, invite: await resendInvite(s, id) });
  }
  throw new HttpError(400, "Unknown action");
});
