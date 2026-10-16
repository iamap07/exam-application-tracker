import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { ensureAssignmentFolders } from "@/lib/services/drive-folders";
import { audit } from "@/lib/audit";

// Retry / repair: creates or reuses the SME and exam folders. Never duplicates.
export const POST = route(async (_req, ctx) => {
  const s = await requireAdmin();
  const { id } = await ctx.params;
  const f = await ensureAssignmentFolders(id, s.email, { refresh: true });
  await audit(s, "drive.folders.ensure", "ASSIGNMENT", id, "success");
  return NextResponse.json({ ok: true, url: f.examFolderUrl });
});
