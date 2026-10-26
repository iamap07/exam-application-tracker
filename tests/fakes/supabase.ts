import { authState as A } from "./state";
export const supabaseAdmin = () => ({ auth: { admin: {
  inviteUserByEmail: async (email: string) => { if (A.failInvite) return { data: { user: null }, error: { message: "smtp down" } }; const id = `auth-${A.invited.length + 1}`; A.invited.push({ email, id }); return { data: { user: { id } }, error: null }; },
  updateUserById: async (id: string, attrs: { app_metadata?: { role?: string } }) => { if (attrs.app_metadata?.role) A.roles.set(id, attrs.app_metadata.role); return { error: null }; },
} } });
export const supabaseServer = async () => ({ auth: { getUser: async () => ({ data: { user: A.currentUser } }), signOut: async () => ({}) } });
