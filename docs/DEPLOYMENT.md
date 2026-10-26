# Deployment guide (GitHub → Vercel → Supabase + Google + Resend)

You do not need to install an editor or change any code. Everything below is done in web dashboards.
Allow about 60–90 minutes the first time. Do the steps in order.

## 0. Accounts you need
GitHub, Vercel, Supabase, Google Cloud (and a Google Workspace account if you want a Shared Drive, see 2.4), and Resend with a domain you control (for sending email).

## 1. Put the code in a private GitHub repository
1. On github.com click **New repository**, name it `exam-application-tracker`, choose **Private**, create it empty (no README).
2. Unzip the project. Then choose ONE way to upload:
   - **GitHub Desktop (easiest):** install GitHub Desktop → *File → Add local repository* → pick the unzipped folder → *Commit to main* → *Publish repository* (tick **Keep this code private**).
   - **Web upload:** on the empty repo click *uploading an existing file* and drag the folder contents in. The browser accepts at most 100 files per upload, so do it in batches (for example `src/app`, then `src/lib` + `src/components`, then `tests`, `docs`, `e2e`, `scripts`, then the loose files). Do not forget the hidden `.github` folder and `.gitignore`. Commit after each batch.
   - **Command line:** `git init && git add . && git commit -m "Initial" && git branch -M main && git remote add origin <your repo url> && git push -u origin main`.
3. Never commit a real `.env` file. Only `.env.example` (no secrets) belongs in the repo.

## 2. Google Cloud: Sheets + Drive access
### 2.1 Project and APIs
1. console.cloud.google.com → create a project (e.g. "Exam Tracker").
2. *APIs & Services → Library*: enable **Google Sheets API** and **Google Drive API**.
### 2.2 Service account
1. *IAM & Admin → Service Accounts → Create*. Name it `exam-tracker`. No project roles are needed (least privilege).
2. Open it → *Keys → Add key → Create new key → JSON*. A file downloads. **This file is a secret; never share it or commit it.**
3. From the JSON you need two values: `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `private_key` → `GOOGLE_PRIVATE_KEY`.
### 2.3 The spreadsheet (primary data store)
1. Create a new blank Google Sheet named "Exam Tracker Data". Share it with the service account email as **Editor**. Share it with nobody else except people who must administer it directly (SMEs must never have access).
2. The ID is the long text in its URL between `/d/` and `/edit` → `GOOGLE_SHEETS_SPREADSHEET_ID`.
3. Leave it empty. The app creates the 13 tabs and headers for you (step 6).
### 2.4 The Drive folder (documents)
**Read this before building anything on top of it.** A service account has no storage quota of its own in a normal "My Drive". If the parent folder lives in an ordinary My Drive, uploads can fail with a *storage quota* error. The reliable setup is a **Shared Drive** (Google Workspace):
1. Create a Shared Drive, add the service account as **Content manager**, and create a folder "Exam Application Tracker" inside it.
2. Open the folder; the ID is the last part of the URL (`.../folders/<ID>`) → `GOOGLE_DRIVE_PARENT_FOLDER_ID` (a full folder URL also works).
3. Add your admins to the Shared Drive so the "Folder" links in the admin screens open for them. Do **not** add SMEs.
4. If you only have a free Gmail account and no Shared Drive, test an upload early (step 6). If it fails with a quota error, this app needs an OAuth-based Drive connection, which is not built yet.
5. SMEs never get direct Drive access. They view and download through the app, which checks ownership each time.

## 3. Supabase (sign-in)
1. supabase.com → new project. Copy from *Project Settings → API*: URL → `NEXT_PUBLIC_SUPABASE_URL`, anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, service_role key → `SUPABASE_SERVICE_ROLE_KEY` (**secret, server only**).
2. *Authentication → Sign In / Providers*: keep **Email** on and **turn OFF "Allow new users to sign up"**. (The app also refuses accounts that have no role, but turn signups off anyway.)
3. *Authentication → URL Configuration*: set **Site URL** to your Vercel URL (step 5) and add `https://YOUR-URL/auth/confirm` to **Redirect URLs**. Come back and do this once you know the URL.
4. *Authentication → Email Templates*: edit each template's link so it goes through the app (the defaults put tokens in the URL fragment, which the server cannot read):
   - Invite user: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/reset-password`
   - Magic link: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`
   - Confirm signup / Change email: same pattern with `type=signup` / `type=email_change`.
5. **Custom SMTP (important).** Supabase's built-in email sender is limited to a handful of messages per hour and only to project members, so SME invitations will not arrive. *Authentication → SMTP Settings*: enable custom SMTP using Resend (host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key, sender = an address on your verified domain).
6. *Authentication → Users → Add user*: create **your own** account (email + password, tick *Auto Confirm*). This will be the Super Admin. Put that email in `BOOTSTRAP_SUPER_ADMIN_EMAILS`.
   Later you can add Operations admins from the app (Settings → Add an Operations admin).

## 4. Resend (notification emails)
1. resend.com → *Domains → Add domain*, add the DNS records, wait for "Verified".
2. *API Keys → Create* → `RESEND_API_KEY`. Choose a sender → `EMAIL_FROM` (for example `Exam Tracker <tracker@yourdomain.com>`).

## 5. Vercel
1. vercel.com → *Add New → Project* → import the GitHub repo. Framework is detected as Next.js.
2. Before deploying, add **Environment Variables** (Production):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | your final URL, e.g. `https://exam-tracker.vercel.app` (no trailing slash) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from step 3.1 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 3.1 (never expose) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from the JSON key |
| `GOOGLE_PRIVATE_KEY` | `private_key` from the JSON key. Paste it exactly (real line breaks, or `\n` sequences, both work) |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | step 2.3 |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | step 2.4 |
| `RESEND_API_KEY` / `EMAIL_FROM` | step 4 |
| `CRON_SECRET` | a random string of at least 16 characters (Vercel sends it to the cron endpoints automatically) |
| `BOOTSTRAP_SUPER_ADMIN_EMAILS` | your admin email(s), comma separated. These people also receive failure alerts |

   Only variables starting with `NEXT_PUBLIC_` reach the browser; the others never do.
3. Click **Deploy**. When it finishes, copy the URL. If it differs from `NEXT_PUBLIC_APP_URL`, fix that variable and **Redeploy**. Then finish Supabase step 3.3.
4. *Project → Settings → Cron Jobs* should list `/api/cron/reminders` (daily 09:00 IST) and `/api/cron/deliver` (daily 15:00 IST). On Vercel Hobby, cron jobs can run at most once per day; on Pro you can edit `vercel.json` to run them more often. Reminders are **not working** until a scheduled run has succeeded (the Notifications page shows this honestly).

## 6. First run
1. Open your URL and sign in with the bootstrap admin account.
2. **Settings** → look at *Integration health*. Press **Create or repair tabs**; all rows should turn "Yes" for Environment and Google Sheets. Google Drive should say "Connected to folder …". If not, see `docs/TROUBLESHOOTING.md`.
3. **Notifications** → *Send a test email to me*. Check your inbox. Email only shows as verified after this succeeds.
4. Add one test SME (use an email you control) → accept the invitation → confirm you can sign in and see only your own data.
5. Create an exam, set it to **Open**, assign it, and upload a test document as the SME. Check that the Drive folder tree appears (`SMEs/<SME_ID_Name>/Exam_…/01…07`). **This is the moment to detect the Drive quota problem from 2.4.**
6. After the first scheduled cron run (or the next morning), confirm *Scheduler* shows "Yes" on the Notifications page.
7. Work through `docs/PRODUCTION_CHECKLIST.md` before giving SMEs access.

## 7. Updating the app later
Push changes to GitHub; Vercel redeploys automatically. When a release changes the sheet layout (the README says "Schema vN"), add the new columns to the tab (or recreate the tab if it has no data) and press *Create or repair tabs*. The app never overwrites a tab whose headers differ; it reports a mismatch instead.
