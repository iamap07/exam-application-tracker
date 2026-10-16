import "server-only";
import { z } from "zod";
import { SHEETS } from "@/lib/sheets/schema";
import { findById, insert, query, updateById, type Row } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { supabaseAdmin, supabaseServer } from "@/lib/auth/supabase";
import type { Session } from "@/lib/auth/session";
import { smeAdminUpdate, smeInput, smeSelfUpdate } from "@/lib/validation";
import { HttpError } from "@/lib/http";

const SME = SHEETS.SME_Master;
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
const INVITE_DAYS = 7;

export const profileComplete = (r: Row) => (["full_name", "mobile", "department", "designation", "emergency_contact"].every((k) => (r[k] ?? "").trim()) ? "Yes" : "No");

async function sendInvite(sme: Row, role: "sme" | "ops_admin"): Promise<{ sent: boolean; error?: string; userId?: string }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.admin.inviteUserByEmail(sme.email, { redirectTo: `${appUrl()}/auth/confirm?next=/reset-password` });
  if (error || !data.user) return { sent: false, error: error?.message ?? "Invite failed" };
  const { error: e2 } = await sb.auth.admin.updateUserById(data.user.id, { app_metadata: { role } });
  if (e2) return { sent: false, error: "Invite sent but role could not be set: " + e2.message };
  return { sent: true, userId: data.user.id };
}

export async function createSme(actor: Session, raw: unknown) {
  const input = smeInput.parse(raw);
  const row: Row = {
    sme_id: newId("SME"), auth_user_id: "", ...Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v)])),
    employment_status: input.employment_status || "Active", account_status: "Pending Invite",
    invite_expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(), created_by: actor.email, updated_by: actor.email,
  };
  row.profile_complete = profileComplete(row);
  const created = await insert(SME, row); // throws DuplicateError on duplicate email
  await audit(actor, "sme.create", "SME", created.sme_id, "success", undefined, { email: created.email, department: created.department });
  const invite = await sendInvite(created, "sme");
  if (invite.userId) await updateById(SME, created.sme_id, { auth_user_id: invite.userId }, { actor: actor.email });
  if (!invite.sent) await audit(actor, "sme.invite", "SME", created.sme_id, "failure", undefined, { error: invite.error });
  return { sme: created, invite: { sent: invite.sent, error: invite.error } };
}

export async function resendInvite(actor: Session, smeId: string) {
  const sme = await findById(SME, smeId);
  if (!sme) throw new HttpError(404, "SME not found.");
  if (sme.account_status === "Active") throw new HttpError(409, "This SME has already accepted the invitation.");
  const invite = await sendInvite(sme, "sme");
  if (invite.sent) await updateById(SME, smeId, { auth_user_id: invite.userId ?? sme.auth_user_id, account_status: "Pending Invite", invite_expires_at: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString() }, { actor: actor.email });
  await audit(actor, "sme.invite_resend", "SME", smeId, invite.sent ? "success" : "failure");
  return invite;
}

export async function updateSmeByAdmin(actor: Session, smeId: string, raw: unknown, expectedUpdatedAt?: string) {
  const patch = smeAdminUpdate.parse(raw);
  const before = await findById(SME, smeId);
  if (!before) throw new HttpError(404, "SME not found.");
  const merged = { ...before, ...patch } as Row;
  const after = await updateById(SME, smeId, { ...(patch as Partial<Row>), profile_complete: profileComplete(merged) }, { actor: actor.email, expectedUpdatedAt });
  await audit(actor, "sme.update", "SME", smeId, "success", before, after);
  return after;
}

export async function setSmeActive(actor: Session, smeId: string, active: boolean) {
  const sme = await findById(SME, smeId);
  if (!sme) throw new HttpError(404, "SME not found.");
  if (sme.auth_user_id) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(sme.auth_user_id, { ban_duration: active ? "none" : "876000h" });
    if (error) throw new HttpError(502, "Could not change the sign-in access for this SME. Nothing was changed.");
  }
  const after = await updateById(SME, smeId, { account_status: active ? "Active" : "Deactivated" }, { actor: actor.email });
  await audit(actor, active ? "sme.reactivate" : "sme.deactivate", "SME", smeId, "success", { account_status: sme.account_status }, { account_status: after.account_status });
  return after;
}

export async function updateOwnProfile(s: Session, raw: unknown) {
  const patch = smeSelfUpdate.parse(raw); // .strict(): admin-controlled fields are rejected
  const before = await findById(SME, s.smeId!);
  if (!before) throw new HttpError(404, "Profile not found.");
  const after = await updateById(SME, before.sme_id, { ...patch, profile_complete: profileComplete({ ...before, ...patch } as Row) }, { actor: s.email });
  await audit(s, "sme.self_update", "SME", before.sme_id, "success", before, after);
  return after;
}

export async function inviteAdmin(actor: Session, rawEmail: unknown) {
  if (actor.role !== "super_admin") throw new HttpError(403, "Only a Super Admin can add administrators.");
  const email = z.string().trim().toLowerCase().email().parse(rawEmail);
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo: `${appUrl()}/auth/confirm?next=/reset-password` });
  if (error || !data.user) throw new HttpError(502, error?.message ?? "Invite failed");
  await sb.auth.admin.updateUserById(data.user.id, { app_metadata: { role: "ops_admin" } });
  await audit(actor, "admin.invite", "ADMIN", email, "success");
}

/** Called after an invite/magic-link is verified. Activates a pending SME (if the invite has not expired). */
export async function activateOnLogin(): Promise<{ ok: boolean; reason?: string }> {
  const { data } = await (await supabaseServer()).auth.getUser();
  const u = data.user;
  if (!u) return { ok: false, reason: "link" };
  const role = u.app_metadata?.role;
  if (role !== "sme") return { ok: true };
  const [sme] = await query(SME, (r) => r.auth_user_id === u.id);
  if (!sme) return { ok: false, reason: "noaccess" };
  if (sme.account_status === "Deactivated") return { ok: false, reason: "deactivated" };
  if (sme.account_status === "Pending Invite") {
    if (sme.invite_expires_at && Date.parse(sme.invite_expires_at) < Date.now()) return { ok: false, reason: "expired" };
    await updateById(SME, sme.sme_id, { account_status: "Active" }, { actor: u.email ?? "system" });
    await audit({ userId: u.id, role: "sme", email: u.email ?? "" }, "sme.activate", "SME", sme.sme_id, "success");
  }
  return { ok: true };
}
