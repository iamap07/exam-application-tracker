import "server-only";
import { redact } from "@/lib/redact";
import { SHEETS } from "@/lib/sheets/schema";
import { append } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";
import type { Session } from "@/lib/auth/session";

type Actor = Pick<Session, "userId" | "role" | "email"> | { userId: "system"; role: "system"; email: "system" };

/** Best-effort: an audit failure is logged server-side but must not hide the outcome of the business action. */
export async function audit(actor: Actor, action: string, entity: string, entityId: string, outcome: "success" | "failure", before?: unknown, after?: unknown) {
  try {
    await append(SHEETS.Audit_Log, {
      audit_id: newId("AUD"), timestamp: new Date().toISOString(), actor_id: actor.email, actor_role: actor.role,
      action, entity, entity_id: entityId, outcome,
      before_json: before ? JSON.stringify(before).slice(0, 4000) : "", after_json: after ? JSON.stringify(after).slice(0, 4000) : "",
    });
  } catch (e) { console.error("AUDIT WRITE FAILED", action, entityId, redact((e as Error).message)); }
}
