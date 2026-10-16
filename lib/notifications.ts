import "server-only";
import { redact } from "@/lib/redact";
import { SHEETS } from "@/lib/sheets/schema";
import { DuplicateError, insert } from "@/lib/sheets/store";
import { newId } from "@/lib/ids";

/** Creates an in-app notification. Idempotent per key. Email delivery is added in Phase 5 (status stays "Pending"). */
export async function notifySme(p: { smeId: string; examId?: string; subject: string; message: string; type: string; key: string; actor: string }): Promise<boolean> {
  try {
    await insert(SHEETS.Notifications, {
      notification_id: newId("NTF"), recipient_sme_id: p.smeId, exam_id: p.examId ?? "", subject: p.subject, message: p.message, type: p.type,
      idempotency_key: p.key, read_status: "Unread", email_delivery_status: "Pending", delivery_error: "", email_attempts: "0", created_by: p.actor, updated_by: p.actor,
    });
    return true;
  } catch (e) {
    if (e instanceof DuplicateError) return true;
    console.error("notifySme failed", p.type, redact((e as Error).message));
    return false;
  }
}
