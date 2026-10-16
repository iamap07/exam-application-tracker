import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email(),
  GOOGLE_PRIVATE_KEY: z.string().min(1),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().min(1),
  GOOGLE_DRIVE_PARENT_FOLDER_ID: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  BOOTSTRAP_SUPER_ADMIN_EMAILS: z.string().default(""),
});

export const emailConfigured = () => !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

export type Env = z.infer<typeof schema>;

/** Returns validated env or a list of missing/invalid variable names. Never returns values in errors. */
export function checkEnv(): { ok: true; env: Env } | { ok: false; missing: string[] } {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return { ok: true, env: parsed.data };
  return { ok: false, missing: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
}

export function requireEnv(): Env {
  const r = checkEnv();
  if (!r.ok) throw new Error(`Missing or invalid environment variables: ${r.missing.join(", ")}`);
  return r.env;
}
