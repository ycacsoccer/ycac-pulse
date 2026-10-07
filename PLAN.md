# YC&AC Pulse — Coach & Management Revamp Plan

v10 · Oct 2026 · Status: **all 23 phases complete — `npm run verify` green (syntax, 27 unit tests, 14 verifiers, 26 E2E)**

> **v2:** data source moved off Google Sheets to Supabase.
> **v3:** ten numbered requirements captured from the coach/management side; login model,
> signup ownership and content ownership decided (see §2 notes).
> **v4:** post-launch revamp (waves 13–16): position diagrams, performance trend charts +
> TML/friendly attendance split, public injury tracking, docs refresh.
> **v5:** chart & card round 2 (wave 17): diverging goals chart, KPI rate strips,
> player cards with TML/friendly percentages, profile performance timeline incl. absences.
> **v6:** player list round 2 (wave 18): grid grouped into position sections;
> "Tier" renamed **Selection group** site-wide with a tactics/availability explainer.
> **v7:** goal-badge fix (wave 19) + coach position editor (wave 20): profile goal rows
> badged from the match's competition; coaches set best/can-play positions by tapping pitch slots.
> **v8:** attendance leaves the site (wave 21): the public attendance tables, appearance-% cards,
> attendance KPI tile and profile attendance rows are gone — appearances still drive results,
> timelines and selection groups.
> **v9:** test automation (phase 22): `npm run verify` runs syntax → unit → verifiers → Playwright
> E2E; husky gates the commit, GitHub Actions gates the Pages deploy, a smoke suite gates what
> actually went live.
> **v10:** presentation & layout rework (wave 23): matchday-first hero, one segmented stat band
> (record/GF/GA/GD/win rate/clean sheets across TML/friendly/all), bento board with injuries
> de-emphasised, result badges + competition chips, denser player cards — and three real cascade
> bugs fixed (coach `.fixture-card` rules leaking navy-on-navy onto the public fixture, the bare
> `.match-score` gold rule leaking onto index results, "1 goals" pluralisation).

---

## 1. Why we're doing this

The current site is a fan-facing season dashboard. It cannot answer the questions that matter
before a TML match: who is our stable squad, what does the league squad look like vs the friendly
squad, who is this player, and what did we learn last Saturday. The data layer itself also has to
go: two Google workbooks, JSONP scraping of gviz, a duplicated signup pair, an Apps Script write
endpoint, and no field for photos.

---

## 2. Requirements → where they land

| # | Requirement | Screen / feature | Status |
|---|---|---|---|
| 1 | **Language selector** — EN default, 日本語, 简体中文, whole site | `i18n.js` + selector in every masthead; retrofits `index` + `squad-picker` | ✅ done (Phase 3) |
| 2 | **Admin tool** — player management, matchday management, signups entered by coach | `admin.html` (Phase 7) | ✅ done |
| 3 | **Squad selector per match** | `squad-picker.html` rewired to Supabase + photos + core-weighted suggest | ✅ done (Phase 11) |
| 4 | **Squad & match review for past matches** | `match.html?id=` — lineup, scorers, review | ✅ done (Phase 8) |
| 5 | **Team player profile** | `players.html` grid | ✅ done (Phase 6) |
| 6 | **Coach reflection & feedback per match** | `match_notes` table → edited in admin (Phase 7), shown on `match.html` (Phase 8) | ✅ done |
| 7 | **Team guideline & coach instruction** | `team_content` table → edited in admin (Phase 7), shown on `team.html` (Phase 9) | ✅ done |
| 8 | **Simple password login for team-only pages** | shared **team password** (one Supabase team account) for read-only pages; **coach login** for admin/writes | ✅ done (Phase 4) |
| 9 | **Player profile** — info, history, stats, profile pic | `player.html?id=` (Phase 6) | ✅ done |
| 10 | **Coach dashboard** — all player statistics | `coach.html` (Phase 5) | ✅ done |

**Decisions recorded this session:**
- Login = *team password + coach login*, both **password-only forms** (no email fields): players
  type one shared team password (opens squad, signups, match review, guidelines); admin actions
  need the coach password (both account addresses are built into `config.js`).
- Signups are **entered by you in the admin tool** (player self-service may come later — the schema
  leaves room for it).
- Team guideline / coach instruction content is **editable in the admin tool**, not in code.

---

## 3. What the data says today (verified)

11 played matches — 4 TML (incl. BFC Tokyo 0–4, 04 Oct, entered 06 Oct) · 7 friendlies · none pending · 38 players, 33 used.

Stable squad under the **TML-only core rule** (core = ≥67% of TML matches; friendly attendance
feeds the reliability score but never changes the tier):

| Tier | Players |
|---|---|
| 🟢 Core (15) | Rick, Urabe, Hitoshi, Mo, Umit, Hiramatsu, Bangjie, Ryu, Masashi, Chevy, Kosei, Jude, Kouhei, Ryoga, Sun |
| 🔵 Rotation (4) | Souta, Ron, Hubert, Yuto |
| 🟡 Depth (14) | Kazuki, Take, Takeru, Dai, Toshi, Masa, Taisei, Hisashi Ide, Kaede, Liu, Shinya, Teru, Muro, Watabe |
| ⚪ Inactive (5) | Daisuke, Micah, Ryota, Ryuji, Yohei |

Data gaps fixed at migration: duplicate shirt #1 (Hiramatsu & Hisashi Ide) · no photos ·
empty `minutes` · duplicate Signups/EventSignups merged into one table.

---

## 4. Target architecture

```
┌───────────────────────────────────────────────────────────┐
│ Static site (GitHub Pages)                                │
│ public:  index · players · player · squad-picker          │
│ team:    coach · match · team   (team password)           │
│ admin:   admin              (coach login)                 │
│ shared:  stats.js · i18n.js · auth.js · config.js         │
└──────────────┬────────────────────────────────────────────┘
               │ anon key (public reads) · team session · coach session
┌──────────────▼────────────────────────────────────────────┐
│ Supabase — Postgres + RLS · Storage (photos) · Auth       │
└────────────────────────────────────────────────────────────┘
    Entry: admin.html from your PC
```

### 4.1 Schema

Public (anon `SELECT`): `players`, `matches`, `appearances`, `goals`.
Team-only (authenticated `SELECT`): `signups`, `saved_squads`, `match_notes`, `team_content`.
Coach-only (write): everything, gated by `is_coach()` — membership held in a `coach_roster` table.
Never readable/writable by anon: `coach_notes`, `coach_roster`.

| Table | Purpose | Req |
|---|---|---|
| `players`, `matches`, `appearances`, `goals` | core stats | 5, 9, 10 |
| `signups` | one table (merged pair), coach-entered | 2 |
| `saved_squads` | per-match squad selection | 3 |
| `match_notes` | reflection, coaching points, squad review per match | 6 |
| `team_content` | guideline / coach instruction pages, admin-editable slugs | 7 |
| `coach_notes` | private player notes, squad-status override | 10 |
| `coach_roster` | who counts as a coach (`is_coach()`) | 8 |

All in `supabase/migrations/0001_init.sql` (nothing applied yet, so it stays a single migration).

### 4.2 Login design (requirement 8)

- **Team password** = one shared Supabase Auth account (`config.teamEmail`). A player opens a
  restricted page, types the team password once → `signInWithPassword` → session persists in the
  browser. No accounts to manage; rotate by changing that one password.
- **Coach login** = one coach account (`config.coachEmail`), also password-only — the form never
  asks for an address; the page signs in the configured account. `is_coach()` gates every write
  policy. Admin and coach dashboard actions are impossible for team sessions even if the UI were
  bypassed.
- Pages call `requireTeam()` / `requireCoach()` from `auth.js`, which redirects to a login panel
  (translated, requirement 1) when there is no session.
- Honest limitation: the team password is shared, so it identifies *the team*, not a person.
  Player self-service signups would need per-player accounts later.

### 4.3 Shared code

- **`stats.js`** *(done)* — per-competition metrics, tiers, reliability, coverage.
- **`i18n.js`** — dictionaries for `en` / `ja` / `zh-CN`; `?lang=` param, `localStorage`
  persistence, `<select>` in every masthead, default **English**. Applies to all pages, UI strings
  and date/number formats (`Intl`). Note: *coach-authored content (guidelines, match feedback) is
  shown as written — only the interface is translated.*
- **`auth.js`** — session helpers, `requireTeam` / `requireCoach`, login panel.
- **`data.js`** — Supabase client + typed fetch helpers (replaces the gviz loader in `app.js`).

### 4.4 Metrics & tiers

Per competition (TML / Friendly / All): apps, starts, subs, %, goals, assists, clean sheets,
availability vs actual, last appearance, current run.
Tiers: 🟢 Core = **TML ≥67% only** · 🔵 Rotation = TML ≥33% or overall ≥50% · 🟡 Depth = any
appearance · ⚪ Inactive = none. Reliability = `0.6 × TML% + 0.4 × Friendly%`.
Thresholds live in `stats.js`; coach can override per player in `coach_notes`.

---

## 5. Screens

1. **`coach.html` — Coach Dashboard** (team login) — req 10
   Stable-squad board by tier with photos · TML/Friendly/All lens (TML default) · TML squad
   snapshot + next fixture with signups · position coverage matrix · flags (missing photos,
   duplicate numbers, friendly-only players, declined-but-started).
2. **`admin.html` — Admin** (coach login) — req 2, 6, 7
   Players CRUD + photo upload · fixtures & results entry (score → tap squad → goals/assists) ·
   signups entry per fixture · edit `match_notes` per match · edit guidelines/coach instructions ·
   JSON backup button.
3. **`squad-picker.html` — Squad selector** — req 3
   Rewired to Supabase, photos on cards, core-weighted "Suggest squad", saves to `saved_squads`
   (Apps Script endpoint deleted).
4. **`match.html?id=` — Match & squad review** — req 4, 6
   Result, lineup with photos, scorers, signups that fixture, and the coach's reflection /
   coaching points.
5. **`team.html` — Team guideline & coach instruction** — req 7
   Renders admin-edited `team_content`, per language as written.
6. **`players.html` + `player.html?id=` — Profiles** — req 5, 9
   Grid: photo cards, filter by position/tier. Detail: photo, info, shirt number, positions,
   bio; stats split TML/Friendly; match-by-match history; goals; reliability & tier.
7. **`index.html` — public, TML first** — TML Division 3 section → squad links → friendlies
   collapsed → Instagram; photos on the stable-squad chips, results & fixtures first.
8. **Language selector** — req 1 — in every masthead, EN/JA/中文, affects everything.

---

## 6. Delivery phases

| Phase | Scope | Needs Supabase project? |
|---|---|---|
| **0** | Schema + RLS + storage (`0001_init.sql` incl. v3 tables) | ✅ **done** — applied, RLS verified |
| **1** | Migration `migrate-from-sheets.cjs` (dry-run ✅) | ✅ **done** — imported & verified (`verify-import.cjs` 21/21) |
| **2** | `stats.js` + `verify-stats.cjs` | ✅ done |
| **3** | `i18n.js` + language selector, retrofit `index` + `squad-picker` | ❌ — **done** (161 keys × 3 languages, `verify-i18n.cjs` ✅) |
| **4** | `data.js` + `auth.js` (team password, coach login, RLS roles) | ✅ **done** — `login.html`, masthead auth slots; `verify-auth.cjs` 22/22 |
| **5** | Coach dashboard `coach.html` | ✅ **done** — tier board + lens, fixture signups, coverage, flags; `verify-coach.cjs` 21/21 |
| **6** | Profiles `players.html` / `player.html` + photo upload | ✅ **done** — grid + detail + coach photo upload; `verify-profiles.cjs` 21/21 |
| **7** | Admin `admin.html` (players, matchday, signups, notes, content, backup) | ✅ **done** — CRUD + lineup/goals entry + content + backup; `verify-admin.cjs` 38/38 |
| **8** | Match review `match.html` + coach feedback | ✅ **done** — result hero, lineup+photos, scorers, signups, coach review; `verify-match.cjs` 25/25 |
| **9** | Team page `team.html` | ✅ **done** — renders `team_content` as written, 3 slugs; `verify-team.cjs` 16/16 |
| **10** | Public revamp — TML first, photos in attendance | ✅ **done** — index reads Supabase (gviz gone), stable-squad chips, friendlies folded, photo attendance w/ TML summary first; `verify-index.cjs` 24/24 |
| **11** | Squad picker rewire (Supabase, photos, core-weighted suggest) | ✅ **done** — team-gated boot, coach-only save to `saved_squads` (deactivate-then-insert), photo cards, stats.js suggest; Apps Script/gviz gone; `verify-picker.cjs` 41/41 |
| **12** | Cleanup: dead code in `squad-picker.js` (~8 duplicate defs), gviz/Apps Script removal, retire `.xlsx` generators, README | ✅ **done** — 27 dead lines gone (one `squadImageSVG` left), `verify-stats.cjs` now reads Supabase, `.xlsx` generators + workbooks deleted, orphan i18n keys pruned; README data-source section rewritten |

**Revamp waves (PLAN v4, 06 Oct 2026)** — coach's requests after go-live:

| Phase | Scope | Status |
|---|---|---|
| **13** | **Position diagrams** — seed `secondary_positions` for the squad, pitch diagram on every profile: best position ★ + capable positions | ✅ **done** — 33 outfield players seeded (GKs none, Rick → ST override), `positionmap.js` SVG pitch, Positions panel on profile, 6 new checks in `verify-profiles.cjs` (27/27) |
| **14** | **Performance charts + attendance split** — `charts.js` (hand-rolled SVG, no libraries): per-competition goals timeline, W/D-L results and scorer bars on the public index (TML main panel, friendly secondary); the availability table is **replaced** by a TML attendance table (primary, sorted by TML %) plus a friendly attendance fold; index section restructure | ✅ **done** — trend charts + scorer bars in two competition panels, attendance split into `#tml-attendance` + folded `#fnd-attendance`; **fixed a pre-deploy bug** (`match.match_id` → `match.id`: the live attendance table had been showing dashes instead of appearances/percentages) and added `verify-render.cjs` — executes `render()` under a DOM stub against live anon data (17 checks) |
| **15** | **Injuries** — `0002_injuries.sql` (public read / coach write), seed Kosei · Ryoga · Yuto · Souta, admin **Injuries** tab, public squad-status panel on index, badges on players grid, profile and coach board | ✅ **done** — migration applied to Supabase (made idempotent + `notify pgrst, 'reload schema'` after the paste ran against the wrong project), `injuries` table live with 4 seeded rows, 7th admin tab (add/remove, included in backups), squad-status cards on index, badge on grid, note on profile, panel on dashboard, 13 keys ×3 (317 total), new `verify-injuries.cjs` (31 checks) — **all 13 verifiers green** |
| **16** | Docs refresh + full suite green | ✅ **done** — README status table extended (13–16), migration steps cover `0002`, new Verify section documents all 13 verifiers; PLAN/README current; full suite green at commit |
| **17** | **Chart & card round 2** — diverging goals chart (for above the zero line, against below it), KPI rate strips per competition (goals/game, conceded/game, win %, attendance/game), player cards showing TML + friendly appearance percentages, profile hero stat tiles and a performance timeline of every final match with absences labelled | ✅ **done** — `charts.js` diverging SVG + `kpis()` (baseline-anchored geometry asserted), `#perf-*-kpi` strips, `pc-quick` card cells, `profile-tiles` in the hero, `#profile-timeline` (TML/friendly groups, ⚪ Absent rows, result-coloured rail) + new `verify-profile-render.cjs` (grid + profile executed under a DOM stub vs live data) — **all 14 verifiers green** |
| **18** | **Player list round 2** — grid grouped into position sections (GK/DF/MF/AT with name + count heads) and the "Tier" concept renamed so it never reads as an ability ranking: **Selection group** named purely by appearance frequency (**Plays often / Plays sometimes / Plays occasionally / Not yet played** — no hierarchy words) + an explainer that it is a tactics/formation planning aid from attendance & availability, reassessed every match | ✅ **done** — `POSITION_SECTIONS` grouping in `players.js` (skips empty groups, works with filters/search), site-wide value rename in `i18n.js` (EN/JA/ZH: よく出場/たまに出場/数試合に出場/まだ出場なし · 经常出场/有时出场/偶尔出场/尚未出场), `filterTierNote` callout on players + coach pages, `.position-sections` styles; 6 new keys ×3 (**329 total**), `verify-i18n` KEYS regex extended for dynamic `t(section.key)` use — **all 14 verifiers green** |
| **19** | **Profile goal-badge fix** — each goal row on a profile must be badged TML/FND from the match it was scored in: the goals query silently omitted `competition`, so `compClass()` defaulted **every** friendly goal to TML on the profile (the DB data itself was correct) | ✅ **done** — goals query now `select=*,matches(date,opponent,competition)` in `player.js`; `verify-profile-render` asserts rendered TML/FND badge counts against ground truth per scorer, `verify-profiles` guards that every goal row embeds `match.competition` — **all 14 verifiers green** |
| **20** | **Coach position editor** — on a player profile a coach taps a slot on the pitch diagram to set the **best position** or toggle **can-play** positions (segmented mode switch, keyboard-operable slots, Save/Cancel), replacing manual position entry for the common case | ✅ **done** — `positionmap.js` `.editable()` renders all 17 `_COORDS` slots as `role=button`/`tabindex` targets (pm-best / pm-capable / pm-empty), `player.js` draft state + one delegated click/keydown pair on `#profile-positions` + `YCACData.update("players", …)` with a **0-row save guard** (RLS still enforces `is_coach()` whatever the UI shows), coach-only "Edit positions" control re-rendered once the role resolves; styles for `.pm-slot`/`.pm-empty`/`.pos-mode-row`/`.pos-edit-row`; 6 new keys ×3 (**335 total**), `verify-profiles` (editable diagram + anon/team denied + coach write round-trip with restore) + `verify-profile-render` (public view has no editor; full Edit → tap → mode → save → cancel interaction under a listener-recording DOM stub) — **all 14 verifiers green** |
| **21** | **Attendance leaves the site** — attendance stops being a *purpose* of the public pages: the index attendance tables (TML table + folded friendly supplement) and their search box, the attendance-per-game KPI tile, the player-card TML/FND appearance-% cells and the profile hero/stats attendance rows are all removed | ✅ **done** — `index.html`/`app.js` lose the panel, the `attendanceSearch` handler and the position-cell helper (`stats.js` `positionGroup` no longer used on index), `charts.js` `kpis()` takes no `appearances` option, `players.js` cards fall back to `apps · goals`, `player.js` hero drops to 3 tiles and the stats table drops its attendance row; **appearance records stay** — they still power results, timelines, selection groups and the coach dashboard's own `%` column; 8 keys ×3 removed (**327 total**), `filterTierNote` copy in EN/JA/ZH + both pages drops the "attendance and availability" wording; `verify-index` (stats-engine check now `computeSeason` + `ranked`, three negative checks for the panel), `verify-render` (waits on squad chips, 3 KPI tiles, "no rendered output mentions attendance"), `verify-profiles` + `verify-profile-render` (no `%` cells, 3 hero tiles, no attendance row) re-aimed at the absence — **all 14 verifiers green** |
| **22** | **Test automation + deploy gate** — one entry point (`npm run verify`) that funnels four gates: syntax → unit → verifiers → Playwright E2E; the commit is gated by Husky, the deploy by GitHub Actions, and what actually went live by a smoke suite | ✅ **done** — `scripts/check-syntax.js` (`node --check` on every git-tracked `.js`/`.cjs`, JSON parse), `tests/unit/*.test.cjs` (**27 `node --test` tests**: tier/reliability/coverage rules + season split in `stats.js`, diverging-chart geometry + `kpis()` in `charts.js`, key parity/interpolation/wave-21 removals in `i18n.js` — the long-standing "no frontend unit tests" gap), `scripts/run-verifiers.js` splitting the 14 suites into `--group=anon` (CI: i18n, stats, index, render, profile-render) and `--group=live` (local, `.env`: the 9 that create ephemeral users and write rows), Playwright `tests/e2e/**` — **22 tests** over index/grid/profile with **every Supabase call mocked** (`page.route` → `tests/fixtures/public-data.js`: no credentials, no network, deterministic), including public-tables-only, language switch, and no horizontal overflow at 320/390/1440; `.husky/pre-commit` → `verify:fast`; `.github/workflows/pages.yml` → verify → `build:site` (whitelist → `_site/` + `build-info.json`) → `deploy-pages` → `test:smoke` (commit propagation, live pages, login gating), Pages switched from branch to **Actions** deploy so a red run blocks publishing; two real bugs found and fixed along the way — `i18n.setLanguage()` crashing outside a browser, and the fixture card overflowing at 320px — **`npm run verify` + `npm run verify:live` green** |
| **23** | **Presentation & layout rework (wave 23)** — the public pages get a modern, professional presentation without changing what data exists: a matchday-first hero (next fixture with sign-ups, else the last result with a W/D/L badge, static hero-note fallback), one **segmented stat band** replacing the two stacked scorelines (record · goals for · against · **goal difference** · **win rate** · clean sheets, switchable TML / Friendly / All without a reload), a **bento grid** (fixtures + results lead, performance next, stable squad, injuries de-emphasised to the last cell), W/D/L **result badges + competition chips** on every result row, **denser left-aligned player cards**, and typography/a11y polish (tabular numerals, zebra + right-aligned + sticky profile stats table, `:focus-visible`, reduced-motion) | ✅ **done** — three real cascade bugs fixed first: coach `.fixture-card` child selectors leaking onto the public navy fixture (date/opponent/kickoff were navy-on-navy — invisible once live data has a fixture), the bare `.match-score` gold rule from the match page leaking onto index results (draws/losses gold-on-white), and "1 goals" in `players.js`/`app.js`; `app.js` gains `statSnapshot`/`paintBand`/`renderMatchday` (`#matchday`, `#season-*`, `[data-seg]`), `setStats` + the `tml-`/`friendly-` scoreline ids are gone; 6 new keys ×3 (**333 total**: `goalDiff`, `goalOne`, `statGoalOne`, `matchRecordedOne`, `mdNextMatch`, `mdLastResult`); `verify-index` gains matchday/band/bento wiring + both leak-scoping checks, `verify-render` re-aimed at `#season-record` (+ band cells, matchday), E2E re-aimed and extended to **26 tests** (segment switch 2–1–1/1–1–1/3–2–2, matchday hero shows Titans FC, fixture computed-colour regression, no "1 goals") — **all 14 verifiers green** |

Note: the injuries wave needs one manual step — no SQL-execution path exists for the service key,
so `0002_injuries.sql` gets pasted into the Supabase SQL Editor once (README workflow).

Phases ship independently. Phase 3 needs no Supabase and can start immediately; phases 4–11 need
the project to exist. **All phases are now done** (0–23, including the post-launch revamp waves 13–21, the test-automation phase 22 and the presentation wave 23); the `verify-*.cjs` suite (14 scripts) plus `npm run verify` (syntax, 27 unit tests, E2E) guard each area.

---

## 7. Risks

| Risk | Mitigation |
|---|---|
| Anon key is public | anon = `SELECT` on 4 public tables only; team tables need a session; writes need `is_coach()` |
| Shared team password identifies a person? | It doesn't — accepted trade-off of "simple password"; per-player accounts only if self-service signups return |
| Free-tier data loss | admin JSON backup button; versioned migrations; `pg_dump` capable backend |
| 3 TML matches = coarse tiers | raw counts shown beside %; thresholds in `stats.js` |
| Coach-authored content not translated | by design — interface only; document on `team.html` |
| Photo load failures | fallback monogram avatar everywhere |

---

## 8. Open questions

1. **Team password text** — you set it when creating the `team@…` user in Supabase; players get it
   out of band (Band app).
2. **Guidelines seed content** — send me the team guideline / coach instruction text when ready and
   I'll seed it, or you paste it into the admin tool later.
3. **Locales** — UI strings I translate for you (EN/JA/ZH-CN) — no action needed from you.
