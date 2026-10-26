import "server-only";
import type { Session } from "./session";
import { getConfig } from "@/lib/sheets/store";

/** Super Admin always; Ops Admin only if the Super Admin enabled it in System_Config (default: off). */
export async function canViewFinancial(s: Session): Promise<boolean> {
  if (s.role === "super_admin") return true;
  if (s.role !== "ops_admin") return false;
  return (await getConfig("ops_can_view_financial")) === "true";
}
