export const SCHEMA_VERSION = 3; // v2: Document_Registry.upload_key; v3: Notifications.email_attempts/email_sent_at

const AUDIT = ["created_at", "updated_at", "created_by", "updated_by"] as const;

export interface SheetDef { name: string; idColumn: string; headers: string[]; uniqueKeys?: string[][] }

export const SHEETS: Record<string, SheetDef> = {
  SME_Master: {
    name: "SME_Master", idColumn: "sme_id", uniqueKeys: [["email"]],
    headers: ["sme_id", "auth_user_id", "full_name", "email", "employee_id", "mobile", "department", "subjects", "designation",
      "employment_status", "joining_date", "reporting_manager", "emergency_contact", "profile_complete", "account_status", "invite_expires_at", ...AUDIT],
  },
  Exam_Master: {
    name: "Exam_Master", idColumn: "exam_id",
    headers: ["exam_id", "name", "organization", "category", "type", "notification_url", "application_url", "notification_date",
      "application_start", "application_deadline", "correction_deadline", "admit_card_expected", "exam_date", "exam_end_date",
      "city_centre", "eligibility_notes", "fee", "reimbursement_eligible", "travel_eligible", "accommodation_eligible",
      "instructions", "internal_notes", "priority", "status", ...AUDIT],
  },
  Exam_Assignments: {
    name: "Exam_Assignments", idColumn: "assignment_id", uniqueKeys: [["exam_id", "sme_id"]],
    headers: ["assignment_id", "exam_id", "sme_id", "assignment_date", "deadline", "assigned_by", "priority", "assignment_status",
      "ack_status", "application_status", "last_reminder_at", "admin_remarks", "revoked_at", "revoked_by", ...AUDIT],
  },
  Application_Responses: {
    name: "Application_Responses", idColumn: "application_id", uniqueKeys: [["assignment_id"]],
    headers: ["application_id", "assignment_id", "exam_id", "sme_id", "status", "start_date", "submitted_at", "registration_no",
      "applied_post", "centre_city", "fee", "amount_paid", "payment_mode", "payment_ref", "reimbursement_eligible", "remarks",
      "correction_note", "verified_by", "verified_at", ...AUDIT],
  },
  Document_Registry: {
    name: "Document_Registry", idColumn: "document_id", uniqueKeys: [["drive_file_id"], ["upload_key"]],
    headers: ["document_id", "assignment_id", "sme_id", "exam_id", "doc_type", "file_name", "mime_type", "size_bytes", "drive_file_id",
      "drive_url", "uploaded_by", "uploaded_at", "verification_status", "verified_by", "verified_at", "admin_remarks", "replaced_by", "upload_key", ...AUDIT],
  },
  Reimbursement_Tracker: {
    name: "Reimbursement_Tracker", idColumn: "reimbursement_id", uniqueKeys: [["assignment_id"]],
    headers: ["reimbursement_id", "assignment_id", "exam_id", "sme_id", "eligible", "expected_fee", "amount_paid", "claim_applied",
      "claim_date", "receipt_uploaded", "claimed_amount", "approved_amount", "rejection_reason", "approval_status", "payment_status",
      "payment_date", "payment_ref", "admin_remarks", ...AUDIT],
  },
  Admit_Card_Tracker: {
    name: "Admit_Card_Tracker", idColumn: "admit_id", uniqueKeys: [["assignment_id"]],
    headers: ["admit_id", "assignment_id", "exam_id", "sme_id", "admit_card_uploaded", "admit_card_document_id", "verification_status",
      "confirmed_exam_date", "reporting_time", "centre_name", "centre_address", "city", "shift", "travel_required", "accommodation_required",
      "extra_requirements", "sme_confirmed_at", "verified_by", "verified_at", "admin_remarks", ...AUDIT],
  },
  Travel_Accommodation: {
    name: "Travel_Accommodation", idColumn: "travel_id", uniqueKeys: [["assignment_id"]],
    headers: ["travel_id", "accommodation_id", "assignment_id", "exam_id", "sme_id", "verified_exam_date", "centre_address",
      "departure_city", "destination_city", "travel_required", "travel_mode", "departure_at", "return_at", "travel_status", "travel_booking_ref",
      "accommodation_required", "check_in", "check_out", "accommodation_status", "property_details", "accommodation_booking_ref",
      "approved_budget", "confirmation_document_id", "coordinator", "sme_confirmed", "special_requirements", "remarks", ...AUDIT],
  },
  Notifications: {
    name: "Notifications", idColumn: "notification_id", uniqueKeys: [["idempotency_key"]],
    headers: ["notification_id", "recipient_sme_id", "exam_id", "subject", "message", "type", "idempotency_key", "read_status",
      "email_delivery_status", "delivery_error", "email_attempts", "email_sent_at", ...AUDIT],
  },
  Notification_Log: {
    name: "Notification_Log", idColumn: "log_id",
    headers: ["log_id", "notification_id", "channel", "attempt", "status", "error", "rule", "run_at", "created_at"],
  },
  Drive_Folder_Map: {
    name: "Drive_Folder_Map", idColumn: "folder_key", uniqueKeys: [["folder_key"]],
    headers: ["folder_key", "kind", "sme_id", "exam_id", "assignment_id", "folder_id", "folder_url", "subfolder_ids_json", ...AUDIT],
  },
  Audit_Log: {
    name: "Audit_Log", idColumn: "audit_id",
    headers: ["audit_id", "timestamp", "actor_id", "actor_role", "action", "entity", "entity_id", "outcome", "before_json", "after_json"],
  },
  System_Config: {
    name: "System_Config", idColumn: "key", uniqueKeys: [["key"]],
    headers: ["key", "value", "updated_at", "updated_by"],
  },
};
