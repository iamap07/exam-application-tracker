import "server-only";
import { google } from "googleapis";
import { requireEnv } from "@/lib/env";

let cached: { sheets: ReturnType<typeof google.sheets>; drive: ReturnType<typeof google.drive> } | null = null;

export function getGoogle() {
  if (cached) return cached;
  const env = requireEnv();
  const auth = new google.auth.JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive"],
  });
  cached = { sheets: google.sheets({ version: "v4", auth }), drive: google.drive({ version: "v3", auth }) };
  return cached;
}
