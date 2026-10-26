import { z } from "zod";
import { EXAM_STATUSES, PAYMENT_MODES, PRIORITIES } from "./constants";

const text = (max: number) => z.string().trim().max(max).optional().default("");
const date = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker (YYYY-MM-DD)"), z.literal("")]).optional().default("");
const money = z.union([z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 1500 or 1500.50"), z.literal("")]).optional().default("");
const url = z.union([z.string().trim().url("Enter a full URL starting with https://").max(500), z.literal("")]).optional().default("");
const yn = z.enum(["Yes", "No"]).optional().default("No");

export const smeInput = z.object({
  full_name: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  employee_id: text(40),
  mobile: z.union([z.string().trim().regex(/^\+?[0-9 \-]{8,15}$/, "Enter a valid mobile number"), z.literal("")]).optional().default(""),
  department: z.string().trim().min(1, "Enter the department or category").max(80),
  subjects: text(300), designation: text(80), employment_status: text(40), joining_date: date,
  reporting_manager: text(120), emergency_contact: text(200),
});
// partial: omitted fields mean "leave unchanged" (a default of "" would silently erase stored data)
export const smeSelfUpdate = z.object({ mobile: smeInput.shape.mobile, emergency_contact: text(200) }).partial().strict();
export const smeAdminUpdate = smeInput.omit({ email: true }).partial();

export const examInput = z.object({
  exam_id: z.string().trim().regex(/^[A-Za-z0-9_-]{3,40}$/, "Use 3-40 letters, digits, - or _").optional(),
  name: z.string().trim().min(3, "Enter the examination name").max(200),
  organization: text(150), category: text(80), type: text(80),
  notification_url: url, application_url: url,
  notification_date: date, application_start: date, application_deadline: date, correction_deadline: date,
  admit_card_expected: date, exam_date: date, exam_end_date: date,
  city_centre: text(200), eligibility_notes: text(1000), fee: money,
  reimbursement_eligible: yn, travel_eligible: yn, accommodation_eligible: yn,
  instructions: text(2000), internal_notes: text(2000),
  priority: z.enum(PRIORITIES).default("Normal"), status: z.enum(EXAM_STATUSES).default("Draft"),
}).superRefine((v, ctx) => {
  const order: [string, string, string][] = [["application_start", "application_deadline", "Deadline must be on or after the start date"], ["application_deadline", "exam_date", "Exam date must be on or after the application deadline"], ["exam_date", "exam_end_date", "End date must be on or after the exam date"]];
  for (const [a, b, msg] of order) {
    const x = (v as Record<string, string>)[a], y = (v as Record<string, string>)[b];
    if (x && y && y < x) ctx.addIssue({ code: "custom", path: [b], message: msg });
  }
});

export const assignInput = z.object({
  exam_id: z.string().min(1), mode: z.enum(["single", "selected", "all", "filtered"]),
  sme_ids: z.array(z.string()).optional().default([]), department: text(80), subject: text(80),
  deadline: date, priority: z.enum(PRIORITIES).default("Normal"), remarks: text(500),
  expected_count: z.number().int().min(0).optional(),
});

export const applicationInput = z.object({
  registration_no: text(80), applied_post: text(150), centre_city: text(150), fee: money, amount_paid: money,
  payment_mode: z.union([z.enum(PAYMENT_MODES), z.literal("")]).optional().default(""), payment_ref: text(100),
  start_date: date, remarks: text(1000),
}).partial().extend({ submit: z.boolean().optional().default(false), expected_updated_at: z.string().optional() }); // omitted field = unchanged

const dt = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use the date and time picker"), z.literal("")]).optional().default("");
const yn2 = z.union([z.enum(["Yes", "No"]), z.literal("")]).optional().default("");

export const reimbClaimInput = z.object({ claimed_amount: money, submit: z.boolean().optional().default(false), expected_updated_at: z.string().optional() });
export const reimbReviewInput = z.object({
  action: z.enum(["start_review", "request_correction", "approve", "reject", "record_payment", "mark_not_eligible", "mark_eligible"]),
  reason: text(500), approved_amount: money, payment_date: date, payment_ref: text(100),
});
export const admitInput = z.object({
  confirmed_exam_date: date,
  reporting_time: z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)"), z.literal("")]).optional().default(""),
  centre_name: text(200), centre_address: text(500), city: text(100), shift: text(60),
  travel_required: yn2, accommodation_required: yn2, extra_requirements: text(1000),
}).partial().extend({ submit: z.boolean().optional().default(false), expected_updated_at: z.string().optional() });
export const admitReviewInput = z.object({ action: z.enum(["verify", "request_correction"]), reason: text(500), accept_date_difference: z.boolean().optional().default(false) });
export const travelInput = z.object({
  departure_city: text(100), destination_city: text(100), travel_required: yn2,
  travel_mode: z.union([z.enum(["Flight", "Train", "Bus", "Car", "Other"]), z.literal("")]).optional().default(""),
  departure_at: dt, return_at: dt, travel_status: z.enum(["Not Required", "Pending Review", "Awaiting Approval", "Approved", "Booking in Progress", "Booked", "Confirmed with SME", "Cancelled"]),
  travel_booking_ref: text(100), accommodation_required: yn2, check_in: date, check_out: date,
  accommodation_status: z.enum(["Not Required", "Pending Review", "Awaiting Approval", "Booking in Progress", "Booked", "Confirmed with SME", "Cancelled"]),
  property_details: text(300), accommodation_booking_ref: text(100), approved_budget: money, coordinator: text(120),
  special_requirements: text(1000), remarks: text(1000), expected_updated_at: z.string().optional(),
}).partial();
