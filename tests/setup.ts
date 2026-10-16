import { beforeEach } from "vitest";
import { resetFakes } from "./fakes/state";

Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@proj.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: "key", GOOGLE_SHEETS_SPREADSHEET_ID: "sheet", GOOGLE_DRIVE_PARENT_FOLDER_ID: "ROOT",
  CRON_SECRET: "0123456789abcdef0123456789abcdef", BOOTSTRAP_SUPER_ADMIN_EMAILS: "boss@x.test", RESEND_API_KEY: "re_test", EMAIL_FROM: "tracker@x.test",
  NEXT_PUBLIC_APP_URL: "https://app.test", EMAIL_SPACING_MS: "0",
});

beforeEach(async () => {
  resetFakes();
  const { ensureSchema } = await import("@/lib/sheets/store");
  await ensureSchema();
});
