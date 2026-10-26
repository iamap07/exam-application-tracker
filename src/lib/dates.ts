export const TZ = "Asia/Kolkata";
export const todayIST = (): string => new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(toISO + "T00:00:00Z") - Date.parse(fromISO + "T00:00:00Z")) / 86400000);
}
