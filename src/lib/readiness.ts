// Pure readiness logic (no I/O) so it is unit-testable.
import { daysBetween } from "./dates";
type Row = Record<string, string>;

export const FLAG_LABELS = {
  admit_missing: "Admit card missing", date_unverified: "Exam date unverified", date_differs: "Date differs from exam schedule",
  details_incomplete: "Centre details incomplete", confirm_overdue: "SME confirmation overdue", travel_pending: "Travel not arranged",
  accommodation_pending: "Accommodation not arranged", sme_confirm_pending: "Waiting for SME to confirm bookings",
} as const;
export type Flag = keyof typeof FLAG_LABELS;

const ARRANGED = ["Booked", "Confirmed with SME", "Not Required"];
export const DEFAULT_WINDOWS = [30, 14, 7, 3, 1];

export function parseWindows(v: string | undefined | null): number[] {
  const n = (v ?? "").split(",").map((s) => parseInt(s.trim())).filter((x) => x >= 1 && x <= 90);
  return n.length ? [...new Set(n)].sort((a, b) => b - a) : DEFAULT_WINDOWS;
}

export function effectiveExamDate(exam: Row, admit?: Row): string {
  return admit?.verification_status === "Verified" && admit.confirmed_exam_date ? admit.confirmed_exam_date : exam.exam_date;
}

export function admitFlags(p: { exam: Row; admit?: Row; hasDoc: boolean; today: string }): Flag[] {
  const f: Flag[] = [];
  const { exam, admit } = p;
  if (!p.hasDoc) f.push("admit_missing");
  if (admit?.verification_status !== "Verified") f.push("date_unverified");
  if (admit?.confirmed_exam_date && exam.exam_date && admit.confirmed_exam_date !== exam.exam_date) f.push("date_differs");
  if (admit?.verification_status === "Pending Verification" && ["centre_name", "centre_address", "city", "reporting_time"].some((k) => !admit[k])) f.push("details_incomplete");
  const date = effectiveExamDate(exam, admit);
  if (date) { const d = daysBetween(p.today, date); if (d >= 0 && d <= 7 && !admit?.sme_confirmed_at) f.push("confirm_overdue"); }
  return f;
}

export function readinessFlags(p: { exam: Row; admit?: Row; travel?: Row; hasDoc: boolean; today: string }): Flag[] {
  const f = admitFlags(p);
  if (p.admit?.travel_required === "Yes" && !ARRANGED.includes(p.travel?.travel_status ?? "")) f.push("travel_pending");
  if (p.admit?.accommodation_required === "Yes" && !ARRANGED.includes(p.travel?.accommodation_status ?? "")) f.push("accommodation_pending");
  if (p.travel && (p.travel.travel_status === "Booked" || p.travel.accommodation_status === "Booked") && p.travel.sme_confirmed !== "Yes") f.push("sme_confirm_pending");
  return f;
}

/** Smallest configured window that still contains the exam; null if past or beyond the largest window. */
export function bucketFor(days: number, windows: number[]): number | null {
  if (days < 0) return null;
  const fit = [...windows].sort((a, b) => a - b).find((w) => days <= w);
  return fit ?? null;
}
