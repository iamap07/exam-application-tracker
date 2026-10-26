// Prints the status of every integration that can be checked without sending anything. Run: npm run setup:check
import { checkEnv, emailConfigured } from "@/lib/env";
import { checkSheetsHealth } from "@/lib/sheets/store";
import { checkDriveHealth } from "@/lib/google/drive";

async function main() {
  const env = checkEnv();
  console.log(env.ok ? "OK    environment variables" : `FAIL  environment variables - missing: ${env.missing.join(", ")}`);
  console.log(emailConfigured() ? "OK    email keys present (send a test email from Notifications to verify delivery)" : "WARN  RESEND_API_KEY / EMAIL_FROM not set: emails will not be sent");
  if (!env.ok) process.exit(1);
  const s = await checkSheetsHealth(); console.log(`${s.ok ? "OK  " : "FAIL"}  google sheets - ${s.detail}`);
  const d = await checkDriveHealth(); console.log(`${d.ok ? "OK  " : "FAIL"}  google drive  - ${d.detail}`);
  process.exit(s.ok && d.ok ? 0 : 1);
}
main().catch((e) => { console.error("Check failed:", e instanceof Error ? e.message : e); process.exit(1); });
