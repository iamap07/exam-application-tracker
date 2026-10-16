import "server-only";
import { supabaseServer } from "@/lib/auth/supabase";
import { SHEETS } from "@/lib/sheets/schema";
import { query } from "@/lib/sheets/store";

export type Role = "super_admin" | "ops_admin" | "sme";
export interface Session { userId: string; email: string; role: Role; smeId?: string }
export class AuthError extends Error { constructor(public status: 401 | 403, msg: string) { super(msg); } }

/**
 * Identity comes ONLY from the verified Supabase session. Role comes from app_metadata (service-role writable only).
 * SME_ID is looked up server-side by auth_user_id; never read from client input. Non-Active SMEs get no session.
 */
export async function getSession(): Promise<Session | null> {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user?.email) return null;
  const user = data.user;
  const email = user.email!.toLowerCase();
  const bootstrap = (process.env.BOOTSTRAP_SUPER_ADMIN_EMAILS ?? "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
  let role = user.app_metadata?.role as Role | undefined;
  if (!role && bootstrap.includes(email)) role = "super_admin";
  if (!role) return null;
  if (role === "sme") {
    const [sme] = await query(SHEETS.SME_Master, (r) => r.auth_user_id === user.id);
    if (!sme || sme.account_status !== "Active") return null;
    return { userId: user.id, email, role, smeId: sme.sme_id };
  }
  return { userId: user.id, email, role };
}

export async function requireRole(...allowed: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError(401, "Not signed in");
  if (!allowed.includes(s.role)) throw new AuthError(403, "Not permitted");
  return s;
}
export const requireAdmin = () => requireRole("super_admin", "ops_admin");

/** SMEs may only touch rows whose sme_id equals their own. */
export function assertOwnership(s: Session, record: Record<string, string>) {
  if (s.role === "sme" && record.sme_id !== s.smeId) throw new AuthError(403, "Not permitted");
}
