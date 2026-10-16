import { describe, expect, it } from "vitest";
import { getSession, requireRole } from "@/lib/auth/session";
import { activateOnLogin, createSme, setSmeActive } from "@/lib/services/smes";
import { authState } from "./fakes/state";
import { ADMIN, rows, seedSme } from "./helpers";
import { setRaw } from "./helpers";

const as = (email: string, id: string, role?: string) => { authState.currentUser = { id, email, app_metadata: role ? { role } : {} }; };

describe("session resolution (server-side identity)", () => {
  it("no user, or a user without a role, gets no session", async () => {
    expect(await getSession()).toBeNull();
    as("random@x.test", "u1"); expect(await getSession()).toBeNull();
  });
  it("bootstrap emails become Super Admin; other emails with role-less accounts do not", async () => {
    as("boss@x.test", "u1"); expect(await getSession()).toMatchObject({ role: "super_admin", email: "boss@x.test" });
    as("BOSS@X.TEST", "u1"); expect((await getSession())?.role).toBe("super_admin");
    as("evil@x.test", "u2"); expect(await getSession()).toBeNull();
  });
  it("an SME session carries the SME_ID looked up from the sheet, never from the client", async () => {
    const sme = await seedSme("S1"); as(sme.email, sme.auth_user_id, "sme");
    expect(await getSession()).toMatchObject({ role: "sme", smeId: "S1" });
  });
  it("SME role with no matching, or a non-Active, SME record gets no session", async () => {
    as("ghost@x.test", "auth-ghost", "sme"); expect(await getSession()).toBeNull();
    const sme = await seedSme("S2", "B", "P", "Deactivated"); as(sme.email, sme.auth_user_id, "sme"); expect(await getSession()).toBeNull();
  });
  it("requireRole enforces the allowed roles", async () => {
    const sme = await seedSme("S1"); as(sme.email, sme.auth_user_id, "sme");
    await expect(requireRole("super_admin", "ops_admin")).rejects.toMatchObject({ status: 403 });
    await expect(requireRole("sme")).resolves.toMatchObject({ smeId: "S1" });
    authState.currentUser = null; await expect(requireRole("sme")).rejects.toMatchObject({ status: 401 });
  });
  it("deactivating an SME removes access immediately and bans the login", async () => {
    const sme = await seedSme("S1"); as(sme.email, sme.auth_user_id, "sme"); expect(await getSession()).toBeTruthy();
    await setSmeActive(ADMIN, "S1", false); expect(await getSession()).toBeNull();
    await setSmeActive(ADMIN, "S1", true); expect(await getSession()).toBeTruthy();
  });
});

describe("invitation activation", () => {
  it("activates a pending SME on first valid login", async () => {
    await createSme(ADMIN, { full_name: "New Sme", email: "new@x.test", department: "M" });
    const inv = authState.invited[0]; as("new@x.test", inv.id, "sme");
    expect(await getSession()).toBeNull(); // not Active yet
    expect(await activateOnLogin()).toEqual({ ok: true });
    expect((await rows("SME_Master"))[0].account_status).toBe("Active"); expect(await getSession()).toMatchObject({ role: "sme" });
  });
  it("refuses an expired invitation and a deactivated account", async () => {
    await createSme(ADMIN, { full_name: "Old Sme", email: "old@x.test", department: "M" });
    const inv = authState.invited[0]; as("old@x.test", inv.id, "sme");
    setRaw("SME_Master", "sme_id", (await rows("SME_Master"))[0].sme_id, "invite_expires_at", new Date(Date.now() - 1000).toISOString());
    expect(await activateOnLogin()).toEqual({ ok: false, reason: "expired" });
    setRaw("SME_Master", "sme_id", (await rows("SME_Master"))[0].sme_id, "account_status", "Deactivated");
    expect(await activateOnLogin()).toEqual({ ok: false, reason: "deactivated" });
  });
  it("admin accounts need no SME record", async () => {
    as("ops@x.test", "u9", "ops_admin"); expect(await activateOnLogin()).toEqual({ ok: true });
  });
});

import { inviteAdmin } from "@/lib/services/smes";
import { OPS } from "./helpers";
describe("administrator invitations", () => {
  it("only a Super Admin can add an Operations admin; the role is set server-side", async () => {
    await expect(inviteAdmin(OPS, "new@x.test")).rejects.toMatchObject({ status: 403 });
    await expect(inviteAdmin(ADMIN, "not-an-email")).rejects.toThrow();
    await inviteAdmin(ADMIN, "Ops.Person@X.test");
    expect(authState.invited[0].email).toBe("ops.person@x.test"); expect(authState.roles.get(authState.invited[0].id)).toBe("ops_admin");
    expect((await rows("Audit_Log")).some((a) => a.action === "admin.invite")).toBe(true);
  });
});
