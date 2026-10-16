# Exam Application Tracker

Internal web app for managing SME examination applications: assignments, application forms, documents (Google Drive),
reimbursements, admit cards and exam-date verification, company travel/accommodation, notifications and reminders.

**Stack:** Next.js 15 (App Router, TypeScript) · Tailwind · Supabase Auth · Google Sheets (system of record) · Google Drive (documents) ·
Resend (email) · Vercel (hosting + cron) · private GitHub repo.

> **Honest status.** All code is written and the business logic is covered by 175 automated tests that pass. The app has **never been
> built with `next build`, never rendered in a browser, and never run against real Google, Supabase or Resend accounts**
> (the authoring environment had no network). Follow `docs/DEPLOYMENT.md`, then `docs/PRODUCTION_CHECKLIST.md`, before relying on it.

## Documents
| File | Purpose |
|---|---|
| `docs/DEPLOYMENT.md` | Step-by-step GitHub → Google → Supabase → Resend → Vercel setup (no code editing) |
| `docs/PRODUCTION_CHECKLIST.md` | What to verify with real accounts, the 12 acceptance workflows, known limits |
| `docs/TROUBLESHOOTING.md` | Symptom → cause → fix |
| `.env.example` | Every environment variable (no secrets) |

## What is built
- **Roles:** Super Admin, Operations Admin (financial visibility switchable by Super Admin), SME. Identity and role come from the verified Supabase session
  (`app_metadata`, not user-editable); SME_ID is looked up server-side; every API path re-checks ownership. Invite-only, deactivation takes effect immediately.
- **SMEs:** onboarding with email invitation, resend, deactivate/reactivate, self-service profile limited to permitted fields, profile completion.
- **Examinations & assignments:** full exam record; assign to one / selected / all active / filtered SMEs with a server-verified recipient-count confirmation;
  duplicate prevention; revoke with history; reassign.
- **Applications:** draft/resume, validated submit, optimistic-concurrency guard, locked once verified (explicit reopen with reason); admin review
  (verify only when the required documents exist, correction/rejection need reasons).
- **Drive:** `Parent/SMEs/<SME_ID_Name>/Exam_<ID>_<Name>/01…07` created idempotently and reused; server-side upload validation (extension, MIME and file signature must agree; size cap);
  retry-safe uploads; orphan cleanup; replace with history; authorised proxy downloads; nothing public.
- **Reimbursements:** claim → review → approve (full/partial) → **separately recorded payment**; overdue tracking; totals; CSV.
- **Admit cards:** upload never verifies; schedule-vs-confirmed comparison with flags; date mismatch needs explicit acceptance; re-upload forces re-verification.
- **Travel & accommodation:** created only after verification; validated booking states; SME confirmation; readiness dashboard (30/14/7/3/1 days, configurable); planning exports.
- **Notifications:** in-app + email (Resend), manual targeted sends with confirmation, delivery queue with idempotency/retry/skip/logging, rule-based reminders (deduplicated by deterministic keys),
  Vercel Cron endpoints with a shared secret, locks, failure alerts, and honest verification of email/scheduler status.
- **Dashboards, tables, exports:** all figures computed from stored data; search/sort/filter/pagination; CSV exports (applications, assignments, reimbursements, upcoming exams, admit cards, travel, accommodation) with formula-injection protection.
- **Hardening:** audit log (actor, role, action, entity, outcome, before/after), per-IP rate limiting, request-size limits, security headers, log redaction of secrets/emails, data-integrity checker (Super Admin).

## Sheets schema versions
If you initialised tabs from an earlier build, add these columns (the app refuses to overwrite a tab with different headers):
- **v2** `Document_Registry`: add `upload_key` right after `replaced_by`.
- **v3** `Notifications`: add `email_attempts`, `email_sent_at` right after `delivery_error`.
(A fresh install gets the current layout automatically.)

## Develop and test
```bash
npm install
npm run typecheck      # TypeScript
npm test               # 175 tests, no network or credentials needed
npm run build          # production build
npm run setup:check    # (needs .env.local) checks env, Sheets and Drive
npm run e2e            # (needs a deployed staging URL + test accounts) see e2e/staging.spec.ts
```
**What the tests are:** unit tests of pure logic, plus integration tests that run the *real* store and services against in-memory fakes of Google Sheets/Drive,
the email provider and Supabase (`tests/fakes/`). They are mocks and are labelled as such. `e2e/staging.spec.ts` is the only suite meant for a real deployment.
**How they were run here:** with a minimal local runner (not vitest itself), plus `tsc` using stand-in types for React/Next/Google/Supabase packages.
So the first real `npm test` and `npm run typecheck` may surface small differences (config aliasing, framework typings) — send them back and they get fixed.

## Acceptance criteria → evidence
| # | Criterion | Automated (fakes) | Needs your real environment |
|---|---|---|---|
| 1 | Admin creates SME; SME sees only own data | `workflow`, `auth`, `isolation` | invitation email + login |
| 2 | Exam assigned to several SMEs; notifications delivered | `assignment`, `workflow`, `notify` | real email delivery |
| 3 | Applications, uploads, private Drive folders | `application`, `drive`, `workflow` | real Drive (quota, sharing) |
| 4 | Records persist in the right tabs | `store`, `workflow` | real spreadsheet |
| 5 | Verification and corrections | `application`, `drive`, `workflow` | — |
| 6 | Claim, approval, payment independent | `reimbursement`, `workflow` | — |
| 7 | Admit cards and exam-date verification | `admit-travel`, `workflow` | — |
| 8 | Travel/accommodation to SME confirmation | `admit-travel`, `workflow` | — |
| 9 | Reminders via scheduled jobs, no duplicates | `notify`, `workflow` | Vercel Cron actually firing |
| 10 | Cross-SME access rejected server-side | `isolation`, `workflow` | `e2e/staging.spec.ts` |
| 11 | Data survives refresh/re-login | stored in Sheets (`store`) | quick manual check |
| 12 | Failures visible, logged, retryable | `drive`, `notify`, `hardening` | break-and-restore drill (checklist C12) |

## Known limits
Uploads ≤ 4 MB (Vercel request limit) · Drive uploads by a service account need a **Shared Drive** (see deployment §2.4) · Sheets is not transactional and has ~60 reads/min quota
(writes are serialised, versioned and read back; bulk work is batched: ≤25 reminders and ≤15 emails per run) · whole-tab reads suit hundreds of SMEs, not tens of thousands ·
in-app rate limiting is per server instance (add a Vercel Firewall rule for a hard limit) · Vercel Hobby cron is daily only · the CSP blocks framing/form hijacking but is not a full script-source policy ·
the UI uses plain Tailwind components rather than shadcn/ui · admin-facing alerts go by email to `BOOTSTRAP_SUPER_ADMIN_EMAILS`.
