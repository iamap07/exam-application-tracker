// Optional CLI alternative to Settings > "Create or repair tabs". Run: npm run setup:schema
import { checkEnv } from "@/lib/env";
import { ensureSchema } from "@/lib/sheets/store";

async function main() {
  const env = checkEnv();
  if (!env.ok) { console.error("Missing or invalid environment variables:", env.missing.join(", ")); process.exit(1); }
  const report = await ensureSchema();
  for (const r of report) console.log(`${r.status.padEnd(15)} ${r.sheet}${r.detail ? "  - " + r.detail : ""}`);
  if (report.some((r) => r.status === "mismatch")) { console.error("\nSome tabs have different headers. They were NOT changed. Fix them manually."); process.exit(2); }
  console.log("\nSchema is ready.");
}
main().catch((e) => { console.error("Schema setup failed:", e instanceof Error ? e.message : e); process.exit(1); });
