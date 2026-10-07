# YC&AC Pulse Stats

The **YC&AC Official Soccer Top Team** site — fixtures, results, squad statistics, player profiles
and coach tools. Static HTML/CSS/JS on GitHub Pages; **data backend: Supabase (Postgres)**.
Live at https://ycacsoccer.github.io/ycac-pulse/

## Status: complete — all phases done

| Phase | What | Status |
|---|---|---|
| 0 | Supabase schema + RLS (`supabase/migrations/0001_init.sql`) | done — applied to the live project, RLS verified |
| 1 | `migrate-from-sheets.cjs` (one-time import) | done — original import complete; live snapshot now **40 players / 13 matches / 165 appearances / 42 goals / 60 signups / 70 saved-squad rows** after the Oct 17 + Oct 31 fixtures, verified by `node verify-import.cjs` |
| 2 | `stats.js` metrics/tier engine | done — verified by `node verify-stats.cjs` |
| 3 | `i18n.js` + EN/JA/ZH-CN selector, retrofitted on index + squad-picker | done — verified by `node verify-i18n.cjs` |
| 4 | Auth (`auth.js`, `data.js`, `login.html`) | done — normal pages public, one password-only coach login for private tools; legacy team RLS stays read-only with no UI; verified by `node verify-auth.cjs` |
| 5 | Coach dashboard `coach.html` (coach login) | done — tier board, next fixture + signups, coverage matrix, flags + clear Admin/Picker/Team actions; verified by `node verify-coach.cjs` |
| 6 | Profiles `players.html` / `player.html` + photo upload | done — public grid with position/tier/name filters, detail with stats split + history + goals, coach-only photo upload; verified by `node verify-profiles.cjs` (21/21) |
| 7 | Admin tool `admin.html` (coach login) | done — players CRUD + photo, fixtures/results + tap-a-squad lineup + goals/assists, signups entry, match notes, team content, JSON backup; verified by `node verify-admin.cjs` (38/38) |
| 8 | Match detail `match.html?id=` | done — public fixture/result, lineup with photos, scorers/assists; signups + coach review load only for a verified coach; linked from index and player history/goals; verified by `node verify-match.cjs` |
| 9 | Team page `team.html` (coach login) | done — renders admin-edited `team_content` (guidelines, coach instructions, club info) exactly as written; verified by `node verify-team.cjs` |
| 10 | Public index revamp `index.html` (TML-first) | done — Supabase via `data.js` (gviz gone), stable-squad chips from `stats.js`, friendlies folded, photos + TML summary first in attendance, results/fixtures link to match review; verified by `node verify-index.cjs` (24/24) |
| 11 | Squad picker rewire `squad-picker.html` (coach login) | done — Supabase via `data.js` (Apps Script endpoint + gviz gone), photos on roster cards, core-weighted "Suggest squad" from `stats.js`, save to `saved_squads` (deactivate-then-insert keeps one active group); verified by `node verify-picker.cjs` |
| 12 | Cleanup | done — dead duplicate defs removed from `squad-picker.js`, `verify-stats.cjs` rewired to Supabase (gviz gone from the suite), `.xlsx` generators + workbooks deleted, orphan picker i18n keys pruned, README data-source section rewritten |
| 13 | Position diagrams (`positionmap.js`) | done — `secondary_positions` seeded for all 33 outfield players (keepers none), SVG pitch (best ★ + capable dots) on every profile; verified by `node verify-profiles.cjs` |
| 14 | Performance charts + attendance split (`charts.js`) | done — hand-rolled SVG trend charts (goals for/against along the timeline, W/D-L chips) + scorer bars in TML/friendly panels; availability table replaced by a TML attendance table + friendly fold; fixed the pre-existing `match.match_id` attendance bug; verified by `node verify-index.cjs` + `node verify-render.cjs` |
| 15 | Injury tracking (`supabase/migrations/0002_injuries.sql`) | done — applied to the live project, public squad-status panel + badges on grid/profile/dashboard, admin **Injuries** tab (in backups); verified by `node verify-injuries.cjs` (31/31) |
| 16 | Docs refresh | done — README/PLAN current; full 13-verifier suite green |
| 17 | Chart & card round 2 | done — diverging goals chart (for above zero, against below), KPI rate strips (goals/game, conceded/game, win %, attendance/game), player cards with TML + friendly percentages, profile hero stat tiles + performance timeline with every match incl. absences; verified by `node verify-profile-render.cjs` (14 verifiers total) |
| 18 | Player list round 2 | done — player grid grouped into position sections (GK/DF/MF/AT); "Tier" renamed **Selection group** and the four bands named by appearance frequency only (**Plays often / Plays sometimes / Plays occasionally / Not yet played**) with a tactics/availability explainer — no ability or hierarchy wording; 329 i18n keys ×3 |
| 19 | Profile goal-badge fix | done — profile goal rows are badged TML/FND from the match's competition (the goals query was missing `competition`, so every friendly goal read TML); guarded by `verify-profile-render.cjs` + `verify-profiles.cjs` |
| 20 | Coach position editor | done — on a player profile a coach taps a slot on the pitch diagram to set the **best position** or toggle **can-play** positions (mode switch, Save/Cancel, keyboard-operable slots); coach-only UI, writes still RLS-gated by `is_coach()` with a 0-row save guard; 335 i18n keys ×3; covered by `verify-profiles.cjs` + `verify-profile-render.cjs` |
| 21 | Attendance leaves the site | done — index attendance tables + search box, the attendance/game KPI tile, the cards' TML/FND appearance-% cells and the profile hero/stats attendance rows are gone (appearances still power results, timelines and selection groups; the coach dashboard keeps its own `%` column); 327 i18n keys ×3; guarded by `verify-index.cjs`, `verify-render.cjs`, `verify-profiles.cjs`, `verify-profile-render.cjs` |
| 22 | Test automation + deploy gate | done — one entry point (`npm run verify` = syntax → unit → verifiers → Playwright E2E), husky pre-commit runs the fast gates, GitHub Actions runs the same verify **before** building the Pages artifact (a red run blocks the publish) and smoke-tests the deployed site against `build-info.json`; 27 `node --test` unit tests close the "no frontend unit tests" gap; found + fixed a 320px fixture-card overflow |
| 23 | Presentation & layout rework | done — matchday-first hero (`#matchday`: next fixture + sign-ups or the last result with a W/D/L badge), one **segmented stat band** replacing the two scorelines (record/GF/GA/**GD**/**win rate**/CS across TML · Friendly · All, no reload), **bento grid** (fixtures + results lead, injuries de-emphasised last), result badges + competition chips, denser player cards, tabular numerals / zebra + sticky profile stats table / focus + reduced-motion polish; fixed three cascade bugs (coach `.fixture-card` rules → navy-on-navy public fixture text, bare `.match-score` gold → gold scores on index, "1 goals"); 333 i18n keys ×3; E2E extended to **26 tests** (segment switch, matchday hero, fixture-colour regression, singular "1 goal") |
| 24 | Data wave | done — **form guide + current streak** in the stat band (last-five W/D/L pills + "Won 1 in a row"-style readout, repainted by the active lens), **assists** as gold bars beside the scorers in both performance panels, **goal-timing histogram** (seven 15-min buckets from `goals.minute`, 90+ stoppage column) and the **season trajectory curve** (cumulative GD vs a zero baseline, signed end value) in two new bento cells (`b-trajectory` 7 + `b-timing` 5); `charts.js` gains pure `timingBucket`/`timingSVG`/`trajectorySVG` (+3 unit tests → **30**), 9 new keys ×3 (**342 total**); `verify-index` gains live ground truth (trajectory ends on cumulative GD, histogram counts every datable goal once), `verify-render` gains form/streak/assist checks, E2E extended to **28 tests** (form + streak per lens, assists 5/2, seven buckets, trajectory +2); live goals carry no `minute`/`assist_id` yet — the admin's existing per-goal fields light the modules up as data is entered |
| 25 | Standings | done — the **TML Division 3 table** on the dashboard: all ten clubs (P/W/D/L/GF/GA/GD/Pts) in a full-width bento cell under the results row with **YC&AC Pulse highlighted** (pale-gold row + gold rule, published 4th place); source is a hand-maintained `standings.js` (`cross-fixtures aren't in our database — our own results are`, GD derived from gf − ga so it can't drift); nav "Standings" jumps to the on-page table and the panel links to the official table; real `<table>` (the old "zero tables" guard — an attendance proxy — retargeted to "exactly one: the standings"), inner horizontal scroll keeps 320/390 overflow-free; 12 new keys ×3 (**354 total** — column headers localised in JA/ZH), +4 unit tests (**34**), verify-index/render gained wiring + highlight checks, E2E **29 tests** (data-driven rows, `.is-us` computed background, derived GD, nav anchor) |
| 26 | Player data + simpler access | done — player cards and profile hero now split **TML / Friendly** apps, **appearance rate**, goals and assists (detailed table remains TML/Friendly/All, gains the rate row and fits at 320px without scrolling; stats move before the position diagram); public nav reduced to Fixtures / Standings / Players / Schedule and hero reduced to two actions; match pages are public for fixture/result, lineup, scorers and assists, but signups + coach notes load only for verified coaches; the old player/team login card is gone — one coach login covers Dashboard, Admin, Squad Picker and Team content; 5 new keys + 4 dead team-login keys removed ×3 (**355 total**), auth/match/profile verifiers retargeted (dashboard verifier now uses a rostered coach), E2E **30 tests** including single-login + public-match coverage |
| 27 | Age bands + tactical coverage | done — player profiles show a public age group and give coaches an inline `17–20 / 20s / 30s / 40s / 50s` editor; `0003_player_age_band.sql` is applied and constrains the field without storing dates of birth. The coach dashboard adds selectable **4-2-3-1 / 4-4-2 / 4-3-3 / 3-5-2** pitch heat maps from best + can-play positions, with injured players visible but excluded from available counts; `tactics.js` is pure/tested; 16 new keys ×3 (**371 total**), 4 new unit tests (**38 total**) |

The plan (10 requirements mapped to screens) and the reasoning behind it live in [`PLAN.md`](PLAN.md).

## Data backend

1. Create a free account at [supabase.com](https://supabase.com) and a new project (any name/region).
2. In the dashboard open **SQL Editor** → paste the contents of each file in `supabase/migrations/`
   in filename order — `0001_init.sql` (fresh projects only), then `0002_injuries.sql`, then
   `0003_player_age_band.sql` — → **Run**.
   (`0002` is idempotent — safe to re-run — and ends with a `select` that reports `injuries ready / 4`.)
   (`0003` is also idempotent and must be applied before age groups can be saved from a player page.)
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
   - the team account email → `config.js` → `teamEmail`, the coach account email →
     `config.js` → `coachEmail` (login forms are password-only — the addresses are never typed)
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

## Commands

| Command | Runs | Needs |
|---|---|---|
| `npm run setup:dev` | `npm ci` + Playwright Chromium + husky hooks — once per machine | network |
| `npm run verify` | **the gate**: syntax → unit → anon verifiers → Playwright E2E | network only |
| `npm run verify:fast` | syntax + unit only (what the pre-commit hook runs) | nothing, offline |
| `npm run verify:live` | `verify` + the 9 service-key suites | `.env` |
| `npm run test:e2e` | Playwright against the local server with a **mocked** Supabase | nothing |
| `npm run test:smoke` | Playwright against the **published** site (`SMOKE_COMMIT=` optional) | network |
| `npm run test:verify` / `test:verify:live` | the verifiers alone, `--group=anon` / `live` | `.env` for live |
| `npm run build:site` | whitelist copy of the publishable files → `_site/` + `build-info.json` | git |
| `npm run serve` | local static server on port 4319 | nothing |

## Verify

`npm run verify` is the single entry point. It runs four gates in order and stops at the first
failure:

| # | Gate | Command | What it checks |
|---|---|---|---|
| 1 | Syntax | `node scripts/check-syntax.js` | every git-tracked `.js`/`.cjs` parses (`node --check`), every `.json` is valid; skips `node_modules`, `_site`, `playwright-report`, `test-results`, `*.gs` |
| 2 | Unit | `node --test tests/unit/*.test.cjs` | 34 tests on the frontend logic with plain `node:test` (no framework): tier/reliability/coverage rules and the season split in `stats.js`, chart geometry + KPI maths + the wave-24 goal-timing/trajectory charts in `charts.js`, key parity, interpolation and the wave-21 key removals in `i18n.js`, the wave-25 standings table arithmetic + published order in `standings.js` |
| 3 | Verifiers | `node scripts/run-verifiers.js --group=anon` | the live contract suites that need only the publishable key: `verify-i18n`, `verify-stats`, `verify-index`, `verify-render`, `verify-profile-render` |
| 4 | E2E | `playwright test` | 30 tests in `tests/e2e/` against `scripts/serve-static.js` with **every Supabase call mocked** (`page.route` → `tests/fixtures/public-data.js`): deterministic, no credentials, no network |

```powershell
npm run verify        # gates 1–4
npm run verify:live   # + the 9 suites that hold SUPABASE_SERVICE_ROLE_KEY in .env
```

The other nine verifiers (`verify-import`, `auth`, `coach`, `profiles`, `admin`, `match`, `team`,
`picker`, `injuries`) create ephemeral users and write/restore rows against the real project, so
they only run where `.env` exists: `npm run verify:live`, before you push.

> `verify-stats.cjs` carries an `EXPECTED` snapshot of the database (row counts, tier buckets).
> Entering a new match or editing the roster makes it fail **on purpose** — bump that block in the
> same commit and the suite goes green again.

### Enforcement points

- **Husky pre-commit** (`.husky/pre-commit`) runs `npm run verify:fast` — a file that doesn't parse
  or a unit regression cannot be committed.
- **GitHub Actions** (`.github/workflows/pages.yml`) runs the full `npm run verify` on every push
  and pull request, *then* builds the publishable artifact and deploys it. Pages is set to deploy
  from **GitHub Actions**, so a failing run means the site is **not** republished.
- **Post-deploy smoke** (same workflow, `npm run test:smoke`): polls `build-info.json` until the
  published commit matches the pushed SHA, then loads the public pages against live data —
  3 KPI tiles, no attendance surface, player cards, a real profile, no horizontal overflow, and
  team-only pages still bouncing anonymous visitors to `login.html`.

**Workflow rule:** change → pre-commit (`verify:fast`) → push → CI `verify` → CI builds + deploys
→ CI smoke-tests the published site. If any step is red, nothing ships.

## Publish with GitHub Pages

Deployment is a **workflow job**, not a branch: `main` → `.github/workflows/pages.yml` →
`verify` → `build:site` → `deploy-pages` → `smoke`.

One-time setup:

1. Create the GitHub repository and push this folder to `main` (`.gitignore` already excludes
   `.env`, `node_modules/`, `_site/` and the Playwright output).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions** (that is what makes the
   workflow the gate — a red `verify` run leaves the currently published site untouched).
3. Nothing else: every push to `main` is verified, built and deployed automatically.

What gets published is the whitelist in `scripts/build-site.js` — pages, stylesheets, runtime
scripts and `favicon.svg` (29 files) plus `build-info.json`, which the smoke test uses to confirm
the deployed commit. Verifier scripts, tests, `supabase/`, `PLAN.md`/`README.md` and — by
construction — `.env` are never copied into `_site/`.

Preview a build locally: `npm run build:site` then `npm run serve` (http://127.0.0.1:4319).

## Data source

The site reads **Supabase** (Postgres, through `data.js`) — nothing on the published site touches
Google Sheets any more. The two original workbooks are a read-only archive: keep both Sheets set to
**Anyone with the link: Viewer**. `migrate-from-sheets.cjs` (the one-time Phase 1 import) is the
only script that still knows their gviz URL.
