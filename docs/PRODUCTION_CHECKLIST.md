# Production verification checklist

Automated tests run the real application logic against in-memory fakes of Google, Supabase and the email provider.
They prove the rules (permissions, state transitions, duplicate prevention, retries, idempotency, audit). They do **not** prove that your
real accounts, DNS, quotas and cron schedule are set up correctly. This checklist covers exactly that gap. Do it on staging, then on production.

## A. Configuration
- [ ] Repository is **private**; no `.env` or JSON key file is committed (`git log -p | grep -i private_key` returns nothing).
- [ ] All variables in `docs/DEPLOYMENT.md` §5 are set in Vercel (Production). Secrets are **not** prefixed `NEXT_PUBLIC_`.
- [ ] Supabase: signups **off**; Site URL and redirect URL correct; email templates changed; custom SMTP working.
- [ ] Spreadsheet is shared only with the service account and the admins who need it. Drive parent folder/Shared Drive contains no SMEs.
- [ ] Resend domain verified; test email received.
- [ ] Settings → Integration health: Environment, Google Sheets, Google Drive all "Yes"; Email "Yes" (after the test email); Scheduled jobs "Yes" (after a cron run).
- [ ] Settings → *Create or repair tabs* reports no mismatches. Admin → *Data integrity* shows no problems.

## B. Security spot checks (use two real SME accounts, A and B, plus an admin)
- [ ] Signed out: opening `/admin`, `/sme` redirects to `/login`; `GET /api/admin/export/applications` returns **401** (not a login page).
- [ ] As SME A: `/admin` bounces back to `/sme`; `/api/admin/export/applications` returns **403**.
- [ ] As SME A, using ids that belong to SME B (copy them from the admin screens): `GET /api/sme/applications/<B assignment id>` → **403**; `GET /api/documents/<B document id>/download` → **403**; `PUT` to B's application → **403**.
- [ ] A document's Drive link, opened while signed in to a random Google account, does **not** open (the file is not public).
- [ ] Deactivate SME A in the admin screen: A's next request fails and A cannot sign in again until reactivated.
- [ ] `GET /api/cron/reminders` without the secret → **401**. `GET /api/health` shows only `ok` and `missingEnv`.
- [ ] Uploading `.exe`, a renamed file (e.g. a PNG named `.pdf`), and a file over 4 MB are all rejected with a clear message.
- [ ] Ops admin without payment access cannot open Reimbursements and does not see amounts on application pages; a Super Admin can grant access in Settings.
- [ ] Response headers include `X-Frame-Options: DENY`, `Strict-Transport-Security`, `X-Content-Type-Options`.

You can automate the first six with `npm run e2e` (see `e2e/staging.spec.ts`; set `E2E_BASE_URL`, the credentials and B's ids).

## C. End-to-end business workflows (the acceptance criteria)
Run each on staging with real accounts and tick it only when you saw the result with your own eyes.

| # | Workflow | What you should see |
|---|---|---|
| 1 | Admin adds an SME; SME accepts the invite and signs in | SME gets an email, lands on `/sme`, sees only own data |
| 2 | Admin creates an exam and assigns 2+ SMEs | Confirmation shows the recipient count; each SME gets an in-app notification and an email; Assignments page lists them |
| 3 | Each SME submits an application and uploads documents | Files appear in the right numbered subfolder of that SME's exam folder in Drive; Document_Registry rows exist |
| 4 | Open the spreadsheet | Rows exist in SME_Master, Exam_Master, Exam_Assignments, Application_Responses, Document_Registry, … with ids and timestamps |
| 5 | Admin verifies one application, requests a correction on another | Statuses change; SME sees the reason; verification is refused while documents are missing |
| 6 | Reimbursement: claim → approve → pay | Approving leaves "Payment Pending"; only "Record payment" makes it "Paid" |
| 7 | SME uploads an admit card and confirms details; admin verifies | Date mismatch needs explicit acceptance; verification creates the travel record |
| 8 | Admin books travel/accommodation; SME confirms | Booking needs references; SME is notified; "Confirmed with SME" appears |
| 9 | Reminders | After a **scheduled** run, Notifications shows "Scheduled" runs and Scheduler = Yes; running the job again creates no duplicates |
| 10 | Cross-SME access | Section B results |
| 11 | Refresh and sign out/in | All data is still there (it lives in Sheets, not in the browser) |
| 12 | Break something on purpose (wrong Drive folder id, then restore) | Settings shows Drive failing; uploads fail with a clear error and record nothing; after the fix, retry works and no duplicates appear |

## D. Operations
- [ ] Two people know where the service-account key, Supabase keys and Resend key are stored; there is a plan to rotate them.
- [ ] Someone checks *Notifications → Recent job runs* and the failure-alert mailbox regularly.
- [ ] Google Sheets quota: about 60 reads/minute per service account. For large bulk assignments, press **Send waiting emails now** repeatedly, or request a higher quota in Google Cloud.
- [ ] Back-ups: enable version history on the spreadsheet and keep a monthly copy (File → Make a copy). Drive has its own versioning.
- [ ] Optional hard rate limiting: add a Vercel Firewall rate-limit rule for `/api/*` (the in-app limiter is per server instance only).

## E. Known limits (decide whether they are acceptable)
- Uploads are capped at 4 MB (hosting request-size limit).
- Google Sheets is not a database: no transactions. The app serialises writes per tab, checks for stale edits, verifies writes by reading them back and reports conflicts, but very heavy simultaneous use from many people will be slow and may hit quota.
- Every read loads whole tabs; fine for hundreds of SMEs and a few thousand records, not for tens of thousands.
- Service-account Drive uploads need a Shared Drive (see `docs/DEPLOYMENT.md` §2.4).
- Vercel Hobby allows only daily cron runs.
- The content-security policy blocks framing and form hijacking but is not a full script-source policy.
