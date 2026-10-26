# Troubleshooting

Start with **Settings → Integration health** and **Notifications → Recent job runs**. They show the current state of every integration.
You can also run `npm run setup:check` locally (needs `.env.local`).

| Symptom | Likely cause and fix |
|---|---|
| Settings says *Environment variables … missing: X* | Add X in Vercel → Project → Settings → Environment Variables, then **Redeploy** (changes apply to new deployments only). |
| *Cannot reach the spreadsheet* | Wrong `GOOGLE_SHEETS_SPREADSHEET_ID`, Sheets API not enabled, or the sheet is not shared with the service-account email as Editor. |
| `error:1E08010C:DECODER routines::unsupported` or "invalid private key" | `GOOGLE_PRIVATE_KEY` was pasted wrongly. Copy the whole `private_key` value including the BEGIN/END lines. Real line breaks or literal `\n` both work. |
| *Missing tabs … Run schema initialisation* | Press **Create or repair tabs** (Super Admin). |
| *Header mismatch in <Tab>* or a tab reported as `mismatch` | The tab's first row differs from what the app expects (often after an upgrade). The app will not overwrite it. Add the new columns in the order the README lists (or recreate an empty tab), then repair. |
| Drive health: *Cannot open the parent folder* | Wrong folder id, Drive API not enabled, or the folder/Shared Drive is not shared with the service account. |
| Drive health: *can see the folder but cannot add files* | The service account has Viewer access. Make it **Editor** (My Drive folder) or **Content manager** (Shared Drive). |
| Upload fails with a Drive error mentioning quota | The parent folder is in a normal My Drive and the service account has no storage. Use a **Shared Drive** (`docs/DEPLOYMENT.md` §2.4). |
| Upload says *larger than 4 MB* | Hosting limit. Ask the SME to compress/scan at lower resolution. |
| SME invitation never arrives | Supabase default email is rate-limited. Configure custom SMTP (Deployment §3.5). Check spam. Use **Resend invite** on the SMEs page. |
| Invitation link says *invalid or expired* | The email template was not changed to the `/auth/confirm?token_hash=…` form (Deployment §3.4), the link was used already, or it expired. Resend the invite. |
| Signed in but redirected to login with *no access* | The account has no role, or the SME record is not Active (pending invite, deactivated). Admins: check SMEs page; bootstrap admin: check `BOOTSTRAP_SUPER_ADMIN_EMAILS`. |
| Notifications show *Pending* forever | Email keys missing (nothing is sent and nothing is marked sent), or the job has not run. Use **Send waiting emails now**. |
| Notifications show *Failed* | The error is shown on the row. Common: Resend domain not verified, `EMAIL_FROM` not on the verified domain, invalid recipient. Fix, then **Retry failed and skipped**. |
| Scheduler stays "Pending / not verified" | Vercel Cron did not run or was rejected. Check *Settings → Cron Jobs* in Vercel, that `CRON_SECRET` is set (≥16 chars), and the function logs for 401s. Manual runs never count as verification. |
| *Another run is already in progress* | A job is running or crashed. A lock expires after 10 minutes. |
| *Too many requests* (429) | The in-app limiter tripped (e.g. a script hammering the API). Wait a minute. |
| Edit rejected: *was changed by someone else* | Another person saved first. Reload the page and redo the change. Nothing was overwritten. |
| Google API 429 / "Quota exceeded" in function logs | Sheets read/write quota. Wait a minute; for bulk work run the queue in smaller batches, or request a higher quota. |
| Page says *The change was not saved* | A write failed or could not be read back. Nothing was recorded. Check Integration health, then retry. |

If you suspect inconsistent data (for example after manual edits in the spreadsheet), open **Admin → Data integrity** (Super Admin). It only reads and lists orphaned or inconsistent records.
Avoid editing the spreadsheet by hand; the app finds rows by their ids and expects the header row unchanged.
