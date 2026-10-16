import { describe, expect, it } from "vitest";
import { assign, previewAssignment, revokeAssignment } from "@/lib/services/assignments";
import { createSme } from "@/lib/services/smes";
import { driveState, authState, sheetsState } from "./fakes/state";
import { ADMIN, assignOne, rows, seedExam, seedSme } from "./helpers";

describe("SME onboarding", () => {
  it("creates a profile, invites by email and links the auth user", async () => {
    const out = await createSme(ADMIN, { full_name: "Asha Rao", email: "Asha@X.test", department: "Maths" });
    expect(out.invite.sent).toBe(true);
    expect(authState.roles.get(authState.invited[0].id)).toBe("sme");
    const [r] = await rows("SME_Master");
    expect(r.email).toBe("asha@x.test"); expect(r.account_status).toBe("Pending Invite"); expect(r.auth_user_id).toBe(authState.invited[0].id);
  });
  it("prevents duplicate emails and reports invite failures without losing the record", async () => {
    await createSme(ADMIN, { full_name: "A One", email: "a@x.test", department: "M" });
    await expect(createSme(ADMIN, { full_name: "A Two", email: "A@x.test", department: "M" })).rejects.toThrow(/Duplicate/i);
    authState.failInvite = true;
    const out = await createSme(ADMIN, { full_name: "B One", email: "b@x.test", department: "M" });
    expect(out.invite.sent).toBe(false); expect((await rows("SME_Master"))).toHaveLength(2);
  });
});

describe("assigning examinations", () => {
  it("assigns several SMEs, creating separate records, folders and notifications for each", async () => {
    await seedSme("S1"); await seedSme("S2"); await seedSme("S3");
    const exam = await seedExam();
    const r = await assign(ADMIN, { exam_id: exam.exam_id, mode: "selected", sme_ids: ["S1", "S2"], expected_count: 2 });
    expect(r.summary).toMatchObject({ created: 2, failed: 0, folderFailures: 0 });
    expect(await rows("Exam_Assignments")).toHaveLength(2);
    expect(await rows("Application_Responses")).toHaveLength(2);
    expect(await rows("Reimbursement_Tracker")).toHaveLength(2);
    expect(await rows("Admit_Card_Tracker")).toHaveLength(2);
    expect((await rows("Notifications")).filter((n) => n.type === "new_assignment")).toHaveLength(2);
    expect(driveState.items.filter((i) => i.isFolder && i.name.startsWith("Exam_"))).toHaveLength(2);
    expect((await rows("Exam_Master"))[0].status).toBe("Assigned");
  });
  it("blocks duplicate assignment of the same exam to the same SME", async () => {
    await seedSme("S1"); const exam = await seedExam();
    await assignOne(exam.exam_id, "S1");
    const again = await assign(ADMIN, { exam_id: exam.exam_id, mode: "single", sme_ids: ["S1"] });
    expect(again.summary).toMatchObject({ created: 0, duplicates: 1 });
    expect(await rows("Exam_Assignments")).toHaveLength(1);
    const pv = await previewAssignment({ exam_id: exam.exam_id, mode: "single", sme_ids: ["S1"] });
    expect(pv.alreadyAssigned).toHaveLength(1); expect(pv.willAssign).toBe(0);
  });
  it("requires the confirmed recipient count for bulk assignment and rejects a stale count", async () => {
    await seedSme("S1"); await seedSme("S2"); const exam = await seedExam();
    await expect(assign(ADMIN, { exam_id: exam.exam_id, mode: "all" })).rejects.toThrow(/changed/);
    await expect(assign(ADMIN, { exam_id: exam.exam_id, mode: "all", expected_count: 5 })).rejects.toThrow(/changed/);
    expect((await assign(ADMIN, { exam_id: exam.exam_id, mode: "all", expected_count: 2 })).summary.created).toBe(2);
  });
  it("'all' only includes active SMEs; filters match department and subject", async () => {
    await seedSme("S1", "A", "Physics"); await seedSme("S2", "B", "Chemistry"); await seedSme("S3", "C", "Physics", "Deactivated"); await seedSme("S4", "D", "Physics", "Pending Invite");
    const exam = await seedExam();
    expect((await previewAssignment({ exam_id: exam.exam_id, mode: "all" })).recipients).toBe(2);
    expect((await previewAssignment({ exam_id: exam.exam_id, mode: "filtered", department: "physics" })).recipients).toBe(1);
    await expect(previewAssignment({ exam_id: exam.exam_id, mode: "filtered" })).rejects.toThrow(/filter/);
    await expect(previewAssignment({ exam_id: exam.exam_id, mode: "selected", sme_ids: ["S3"] })).rejects.toThrow(/deactivated/);
  });
  it("only assigns Open or Assigned exams", async () => {
    await seedSme("S1"); const draft = await seedExam({ status: "Draft" });
    await expect(assign(ADMIN, { exam_id: draft.exam_id, mode: "single", sme_ids: ["S1"] })).rejects.toThrow(/Open/);
  });
  it("revoking keeps history, notifies, and re-assigning reuses the same assignment", async () => {
    await seedSme("S1"); const exam = await seedExam();
    const id = await assignOne(exam.exam_id, "S1");
    await expect(revokeAssignment(ADMIN, id, " ")).rejects.toThrow(/reason/);
    const rev = await revokeAssignment(ADMIN, id, "Changed plan");
    expect(rev.assignment_status).toBe("Revoked"); expect(rev.revoked_by).toBe(ADMIN.email);
    const r = await assign(ADMIN, { exam_id: exam.exam_id, mode: "single", sme_ids: ["S1"] });
    expect(r.summary.reassigned).toBe(1);
    const all = await rows("Exam_Assignments");
    expect(all).toHaveLength(1); expect(all[0].assignment_id).toBe(id); expect(all[0].assignment_status).toBe("Active");
    expect((await rows("Audit_Log")).map((a) => a.action)).toEqual(expect.arrayContaining(["assignment.create", "assignment.revoke", "assignment.reassign"]));
  });
  it("reports partial failures per SME instead of claiming success", async () => {
    await seedSme("S1"); await seedSme("S2"); const exam = await seedExam();
    sheetsState.failAppend = { tab: "Exam_Assignments", times: 1 };
    const r = await assign(ADMIN, { exam_id: exam.exam_id, mode: "selected", sme_ids: ["S1", "S2"], expected_count: 2 });
    expect(r.summary.failed).toBe(1); expect(r.summary.created).toBe(1);
    expect(r.results.find((x) => x.outcome === "failed")!.error).toBeTruthy();
  });
  it("assignment still succeeds, and flags it, when Drive folder creation fails", async () => {
    await seedSme("S1"); const exam = await seedExam();
    sheetsState.failAppend = { tab: "Drive_Folder_Map", times: 1 };
    const r = await assign(ADMIN, { exam_id: exam.exam_id, mode: "single", sme_ids: ["S1"] });
    expect(r.summary).toMatchObject({ created: 1, folderFailures: 1 });
  });
});
