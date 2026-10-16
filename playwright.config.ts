import { defineConfig } from "@playwright/test";
// Staging end-to-end tests. They need a deployed environment and real test accounts (see docs/PRODUCTION_CHECKLIST.md).
export default defineConfig({ testDir: "e2e", timeout: 30_000, retries: 0, use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" } });
