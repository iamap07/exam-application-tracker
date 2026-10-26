import { randomBytes } from "crypto";

export type IdPrefix = "SME" | "EXAM" | "ASG" | "APP" | "DOC" | "RMB" | "NTF" | "TRV" | "ACC" | "AUD" | "FLD" | "ADM";

/** Stable, non-sequential IDs (no row numbers, no collisions across concurrent writers). */
export function newId(prefix: IdPrefix): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}
