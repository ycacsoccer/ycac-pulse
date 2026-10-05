# YC&AC Pulse — Coach & Management Revamp Plan

Draft v3 · Oct 2026 · Status: **all 12 phases complete — 11 `verify-*.cjs` checks green**

> **v2:** data source moved off Google Sheets to Supabase.
> **v3:** ten numbered requirements captured from the coach/management side; login model,
> signup ownership and content ownership decided (see §2 notes).

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
- Login = *team password + coach login*: players type one shared team password (opens squad, signups,
  match review, guidelines); admin actions require your own coach account.
- Signups are **entered by you in the admin tool** (player self-service may come later — the schema
  leaves room for it).
- Team guideline / coach instruction content is **editable in the admin tool**, not in code.

---

## 3. What the data says today (verified)

10 played matches — 3 TML · 7 friendlies · 1 TML pending (BFC Tokyo, 04 Oct) · 37 players, 32 used.

Stable squad under the **TML-only core rule** (core = ≥67% of TML matches; friendly attendance
feeds the reliability score but never changes the tier):

| Tier | Players |
|---|---|
| 🟢 Core (16) | Rick, Urabe, Hitoshi, Kosei, Mo, Souta, Umit, Bangjie, Kouhei, Ryu, Sun, Hiramatsu, Masashi, Chevy, Jude, Ryoga |
| 🔵 Rotation (10) | Ron, Kazuki, Take, Yuto, Takeru, Dai, Hubert, Hisashi Ide, Kaede, Shinya |
| 🟡 Depth (6) | Taisei, Teru, Toshi, Masa, Muro, Watabe |
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

- **Team password** = one shared Supabase Auth account (`team@…`). A player opens a restricted page,
  types the team password once → `signInWithPassword` → session persists in the browser. No
  accounts to manage; rotate by changing that one password.
- **Coach login** = your own account; `is_coach()` gates every write policy. Admin and coach
  dashboard actions are impossible for team sessions even if the UI were bypassed.
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
   collapsed → Instagram; photos in the attendance table, TML summary as first column.
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

Phases ship independently. Phase 3 needs no Supabase and can start immediately; phases 4–11 need
the project to exist. **All phases are now done** (0–12); the `verify-*.cjs` suite guards each area.

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
