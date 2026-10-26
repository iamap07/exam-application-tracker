// In-memory stand-ins for Google Sheets/Drive, the email provider and Supabase. Used ONLY by tests.
export interface DriveItem { id: string; name: string; parent: string; props: Record<string, string>; isFolder: boolean; mime?: string; bytes?: Buffer; trashed: boolean }
export const sheetsState = { tabs: new Map<string, string[][]>(), failNext: null as null | { status: number; times: number }, failAppend: null as null | { tab: string; times: number }, dropAppends: false, batchGetFail: false };
export const driveState = { items: [] as DriveItem[], seq: 0, failUpload: 0 };
export const emailState = { mode: "ok" as "ok" | "transient" | "permanent", sent: [] as { to: string; subject: string; key: string }[], attempts: 0 };
export const authState = { invited: [] as { email: string; id: string }[], roles: new Map<string, string>(), failInvite: false, currentUser: null as null | { id: string; email: string; app_metadata: { role?: string } } };

export function resetFakes() {
  sheetsState.tabs.clear(); sheetsState.failNext = null; sheetsState.failAppend = null; sheetsState.dropAppends = false; sheetsState.batchGetFail = false;
  driveState.items = []; driveState.seq = 0; driveState.failUpload = 0;
  emailState.mode = "ok"; emailState.sent = []; emailState.attempts = 0;
  authState.invited = []; authState.roles.clear(); authState.failInvite = false; authState.currentUser = null;
}
