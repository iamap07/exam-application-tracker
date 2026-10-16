export const APP_STATUSES = ["Not Started", "In Progress", "Submitted", "Awaiting Verification", "Correction Required", "Verified", "Rejected", "Cancelled"] as const;
export const EXAM_STATUSES = ["Draft", "Open", "Assigned", "Closed", "Completed", "Cancelled"] as const;
export const PRIORITIES = ["Low", "Normal", "High", "Urgent"] as const;
export const SME_EDITABLE_STATUSES: string[] = ["Not Started", "In Progress", "Submitted", "Correction Required"];
export const PAYMENT_MODES = ["UPI", "Card", "Net Banking", "Cash", "Other"] as const;

export type ReviewAction = "start_review" | "verify" | "request_correction" | "reject";
export const REVIEW_TRANSITIONS: Record<ReviewAction, { from: string[]; to: string; reasonRequired: boolean }> = {
  start_review: { from: ["Submitted"], to: "Awaiting Verification", reasonRequired: false },
  verify: { from: ["Submitted", "Awaiting Verification"], to: "Verified", reasonRequired: false },
  // From "Verified" this is the explicit, reasoned correction workflow for already-verified records.
  request_correction: { from: ["Submitted", "Awaiting Verification", "Verified"], to: "Correction Required", reasonRequired: true },
  reject: { from: ["Submitted", "Awaiting Verification"], to: "Rejected", reasonRequired: true },
};

export const REIMB_APPROVAL = ["Not Eligible", "Eligible — Not Applied", "Applied — Documents Pending", "Submitted for Approval", "Under Review", "Correction Required", "Approved", "Partially Approved", "Rejected"] as const;
export const REIMB_PAYMENT = ["Not Due", "Payment Pending", "Paid"] as const;
export const ADMIT_STATUSES = ["Not Submitted", "Pending Verification", "Correction Required", "Verified"] as const;
export const TRAVEL_STATUSES = ["Not Required", "Pending Review", "Awaiting Approval", "Approved", "Booking in Progress", "Booked", "Confirmed with SME", "Cancelled"] as const;
export const ACC_STATUSES = ["Not Required", "Pending Review", "Awaiting Approval", "Booking in Progress", "Booked", "Confirmed with SME", "Cancelled"] as const;
export const TRAVEL_MODES = ["Flight", "Train", "Bus", "Car", "Other"] as const;
