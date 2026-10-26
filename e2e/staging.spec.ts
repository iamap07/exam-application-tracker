// REAL-ENVIRONMENT tests: they hit a running deployment (E2E_BASE_URL) with real Supabase/Google behind it.
// Required for the isolation tests: E2E_SME_A_EMAIL/PASSWORD, E2E_B_ASSIGNMENT_ID, E2E_B_DOCUMENT_ID (a document owned by SME B).
// Required for admin tests: E2E_ADMIN_EMAIL/PASSWORD. Tests whose variables are missing are skipped, not passed.
import { expect, test, type Page } from "@playwright/test";

const env = (k: string) => process.env[k] ?? "";
const have = (...keys: string[]) => keys.every((k) => env(k));

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(admin|sme)/);
}

test("anonymous visitors are sent to the login page", async ({ page }) => {
  await page.goto("/admin"); await expect(page).toHaveURL(/\/login/);
  await page.goto("/sme/documents"); await expect(page).toHaveURL(/\/login/);
});

test("anonymous API calls are refused, not redirected", async ({ request }) => {
  for (const path of ["/api/admin/export/applications", "/api/documents/DOC-X/download", "/api/sme/profile"]) {
    const r = await request.get(path, { maxRedirects: 0 }); expect(r.status(), path).toBe(401);
  }
});

test("cron endpoints reject requests without the secret", async ({ request }) => {
  for (const p of ["/api/cron/reminders", "/api/cron/deliver"]) expect((await request.get(p)).status()).toBe(401);
  expect((await request.get("/api/cron/reminders", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("the health endpoint exposes setup status but no secrets", async ({ request }) => {
  const r = await request.get("/api/health"); const text = await r.text();
  expect(r.status()).toBe(200); expect(Object.keys(JSON.parse(text)).sort()).toEqual(["missingEnv", "ok"]);
  for (const leak of ["SERVICE_ROLE", "PRIVATE_KEY", "re_", "BEGIN"]) expect(text).not.toContain(leak);
});

test.describe("SME isolation", () => {
  test.skip(!have("E2E_SME_A_EMAIL", "E2E_SME_A_PASSWORD", "E2E_B_ASSIGNMENT_ID", "E2E_B_DOCUMENT_ID"), "needs staging SME credentials and SME B's ids");
  test("SME A cannot reach admin pages, admin APIs, or SME B's records", async ({ page }) => {
    await login(page, env("E2E_SME_A_EMAIL"), env("E2E_SME_A_PASSWORD")); await expect(page).toHaveURL(/\/sme/);
    await page.goto("/admin"); await expect(page).toHaveURL(/\/sme/);
    expect((await page.request.get("/api/admin/export/applications")).status()).toBe(403);
    expect((await page.request.get(`/api/sme/applications/${env("E2E_B_ASSIGNMENT_ID")}`)).status()).toBe(403);
    expect((await page.request.get(`/api/documents/${env("E2E_B_DOCUMENT_ID")}/download`)).status()).toBe(403);
    expect((await page.request.put(`/api/sme/applications/${env("E2E_B_ASSIGNMENT_ID")}`, { data: { remarks: "x" } })).status()).toBe(403);
  });
  test("SME A's own dashboard loads with real data", async ({ page }) => {
    await login(page, env("E2E_SME_A_EMAIL"), env("E2E_SME_A_PASSWORD"));
    await expect(page.getByText("Exams assigned")).toBeVisible();
  });
});

test.describe("Admin", () => {
  test.skip(!have("E2E_ADMIN_EMAIL", "E2E_ADMIN_PASSWORD"), "needs staging admin credentials");
  test("admin overview shows KPIs and the integration health page reports Sheets and Drive", async ({ page }) => {
    await login(page, env("E2E_ADMIN_EMAIL"), env("E2E_ADMIN_PASSWORD"));
    await expect(page.getByText("Registered SMEs")).toBeVisible();
    await page.goto("/admin/settings"); await expect(page.getByText(/Google Sheets —/)).toBeVisible(); await expect(page.getByText(/Google Drive —/)).toBeVisible();
  });
});
