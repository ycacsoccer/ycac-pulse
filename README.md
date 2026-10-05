# YC&AC Pulse Stats

A static season statistics dashboard. **Data backend: Supabase (Postgres) — replacing Google Sheets.**

## Status: migration in progress

| Phase | What | Status |
|---|---|---|
| 0 | Supabase schema + RLS (`supabase/migrations/0001_init.sql`) | done — applied to the live project, RLS verified |
| 1 | `migrate-from-sheets.cjs` (one-time import) | done — 37/11/149/42/44/70 rows imported, verified by `node verify-import.cjs` |
| 2 | `stats.js` metrics/tier engine | done — verified by `node verify-stats.cjs` |
| 3 | `i18n.js` + EN/JA/ZH-CN selector, retrofitted on index + squad-picker | done — verified by `node verify-i18n.cjs` |
| 4 | Auth: team password + coach login (`auth.js`, `data.js`, `login.html`) | done — masthead login state on index/squad-picker; verified by `node verify-auth.cjs` (22/22) |
| 5+ | Coach dashboard, profiles, admin, match review, team page, public revamp, squad picker | see `PLAN.md` |

The plan (10 requirements mapped to screens) and the reasoning behind it live in [`PLAN.md`](PLAN.md).

## Data backend

1. Create a free account at [supabase.com](https://supabase.com) and a new project (any name/region).
2. In the dashboard open **SQL Editor** → paste the contents of `supabase/migrations/0001_init.sql` → **Run**.
   (Or install the Supabase CLI and run `supabase db push` from this folder.)
3. **Authentication → Users → Add user** (tick *Auto confirm*), twice:
   - the **team account** — one shared login for restricted pages (e.g. `team@ycac.jp`) with a
     password the players know;
   - your **coach account** — your own email, used for admin and any write action.
4. In **SQL Editor** register the coach: `insert into coach_roster (email) values ('you@yourmail.com');`
   (Every write policy checks this roster — an account that is not listed can read team pages but
   never change data.)
5. **Project Settings → API Keys**: copy the keys into place.
   - **Project URL** (`https://<ref>.supabase.co`) → `config.js` → `supabaseUrl`
   - **Publishable key** (`sb_publishable_…`, the browser-safe replacement for the old *anon
     public* key) → `config.js` → `supabaseAnonKey`
   - the team account email → `config.js` → `teamEmail`
   - **Secret key** (`sb_secret_…`, click the eye to reveal) is the old *service_role* equivalent:
     use it only as the `SUPABASE_SERVICE_ROLE_KEY` environment variable for the migration below —
     it bypasses RLS, so it must never go into `config.js` or any committed file.
     (The *Legacy anon, service_role* tab holds the old JWT-style keys; we don't need them.)
6. Import the existing sheet data — put both values in the local **`.env`** file (template is
   already in the folder, and `.gitignore` keeps it out of any future repository):
   ```powershell
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=sb_secret_…
   ```
   Then simply run `node migrate-from-sheets.cjs` (env vars / `--url --key` flags also work).
   Check the report, then set both Google Sheets to **File → Share → Anyone with the link →
   Viewer** so they become a read-only archive.

Do not rename table or column names without updating `stats.js` and the pages that read them.

## Publish with GitHub Pages

1. Create a new GitHub repository, for example `ycac-pulse-stats`.
2. Upload the site files: every `.html`, `.css`, and `.js` file in the folder (pages, styles,
   `i18n.js`, `config.js`, `data.js`, `auth.js` …). The `.cjs` scripts, `supabase/`, and the
   `PLAN.md`/`README.md` docs are tooling, not part of the site.
   **Never upload `.env`** — it holds the secret key (only the publishable/anon key belongs in
   `config.js`). If you turn this folder into a git repository, the included `.gitignore`
   already excludes `.env`.
3. In the repository, open **Settings** > **Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder, then save.
6. GitHub will provide the public site URL within a few minutes.

## Data source (legacy: Google Sheets)

The current published site still reads the `Players`, `Matches`, `Appearances`, and `Goals` tabs from
the configured Google Sheet via gviz. That path is retired once Phase 1 completes. The Sheet must
remain **Anyone with the link: Viewer** until then.
