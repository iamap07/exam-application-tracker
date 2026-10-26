import { defineConfig } from "vitest/config";
import path from "path";
const r = (p: string) => path.resolve(__dirname, p);

// Tests run the REAL store/services against in-memory fakes for Google, email and Supabase (see tests/fakes).
// Specific aliases must come before the generic "@" alias.
export default defineConfig({
  resolve: { alias: [
    { find: "@/lib/google/client", replacement: r("tests/fakes/google-client.ts") },
    { find: "@/lib/google/drive", replacement: r("tests/fakes/drive.ts") },
    { find: "@/lib/email", replacement: r("tests/fakes/email.ts") },
    { find: "@/lib/auth/supabase", replacement: r("tests/fakes/supabase.ts") },
    { find: "server-only", replacement: r("tests/fakes/empty.ts") },
    { find: "@", replacement: r("src") },
  ] },
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"], testTimeout: 15000 },
});
