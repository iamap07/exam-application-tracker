import type { FieldDef } from "@/components/client/GenericForm";
const yn = ["Yes", "No"];
export const EXAM_FIELDS: FieldDef[] = [
  { name: "name", label: "Examination name", required: true, wide: true }, { name: "organization", label: "Conducting organization" },
  { name: "category", label: "Exam category" }, { name: "type", label: "Exam type" },
  { name: "notification_url", label: "Notification URL" }, { name: "application_url", label: "Official application URL" },
  { name: "notification_date", label: "Notification release date", type: "date" }, { name: "application_start", label: "Application start date", type: "date" },
  { name: "application_deadline", label: "Application deadline", type: "date" }, { name: "correction_deadline", label: "Correction window deadline", type: "date" },
  { name: "admit_card_expected", label: "Admit card expected date", type: "date" }, { name: "exam_date", label: "Examination date", type: "date" },
  { name: "exam_end_date", label: "Examination end date", type: "date" }, { name: "city_centre", label: "Exam city or preferred centre" },
  { name: "fee", label: "Application fee (amount)" }, { name: "reimbursement_eligible", label: "Reimbursement eligible", type: "select", options: yn },
  { name: "travel_eligible", label: "Travel eligible", type: "select", options: yn }, { name: "accommodation_eligible", label: "Accommodation eligible", type: "select", options: yn },
  { name: "priority", label: "Priority", type: "select", options: ["Low", "Normal", "High", "Urgent"] },
  { name: "status", label: "Status", type: "select", options: ["Draft", "Open", "Assigned", "Closed", "Completed", "Cancelled"] },
  { name: "eligibility_notes", label: "Eligibility notes", type: "textarea" }, { name: "instructions", label: "Special instructions (visible to SMEs)", type: "textarea" },
  { name: "internal_notes", label: "Internal admin notes (not visible to SMEs)", type: "textarea" },
];
