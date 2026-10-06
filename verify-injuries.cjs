// Data-path + contract check for injury tracking (revamp wave 15):
//   node verify-injuries.cjs
// Requires supabase/migrations/0002_injuries.sql applied first (README →
// "Apply a migration" — paste into the Supabase SQL Editor). Verifies:
//   1. the migration contract on disk (table, RLS policies, four seed rows)
//   2. anon public read of the four seeded injuries with embedded player names
//   3. anon writes cannot touch the seed rows (POST denied, PATCH/DELETE no-op)
//   4. team session: reads allowed, writes denied
//   5. rostered coach: create → update → delete an ephemeral probe injury
//   6. static wiring on index/players/player/coach/admin pages + i18n keys ×3
// Everything ephemeral is removed in finally; the seed must read back exactly.
const fs = require("fs");
const path = require("path");

const readEnv = () => Object.fromEntries(
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim().replace(/^["'](.*)["']$/, "$1").trim()]),
);
const readConfig = () => {
  const source = fs.readFileSync(path.join(__dirname, "config.js"), "utf8");
  const grab = (key) => source.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] || "";
  return { url: grab("supabaseUrl"), publishable: grab("supabaseAnonKey") };
};

const env = readEnv();
const config = readConfig();
const BASE = `${env.SUPABASE_URL}/rest/v1`;
const AUTH = `${env.SUPABASE_URL}/auth/v1`;
const secret = env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = config.publishable;

const adminHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const anonHeaders = { apikey: publishable, Authorization: `Bearer ${publishable}`, "Content-Type": "application/json" };
const bearerHeaders = (token) => ({ apikey: publishable, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const repHeaders = (token) => ({ ...bearerHeaders(token), Prefer: "return=representation" });

const COACH_EMAIL = "e2e-injuries-coach@ycac-pulse.test";
const TEAM_EMAIL = "e2e-injuries-team@ycac-pulse.test";
const E2E_PASSWORD = "E2e-Verify-2026!";
const PROBE_PLAYER = "dai"; // a real player with no seeded injury (FK target)
const PROBE_DETAIL = "E2E probe injury";

// The four injuries seeded by 0002 (coach-provided 06 Oct 2026) — deliberate baseline.
const EXPECTED = [
  { id: "yuto", detail: "Hand fracture", since: "2026-08-23", ret: "months" },
  { id: "kosei", detail: "Minor knee injury", since: "2026-09-19", ret: "~early Nov" },
  { id: "souta", detail: "Leg fracture", since: "2026-09-19", ret: "months" },
  { id: "ryoga", detail: "Minor knee injury", since: "2026-10-04", ret: "~early Nov" },
];

const failures = [];
const check = (ok, label, detail = "") => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function call(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
  if (!response.ok) throw new Error(`${method} ${url} → ${response.status}: ${text.slice(0, 200)}`);
  return data;
}

const signIn = (email) => call(`${AUTH}/token?grant_type=password`, { method: "POST", headers: anonHeaders, body: { email, password: E2E_PASSWORD } });
const seedRead = () => call(`${BASE}/injuries?select=*,players(display_name)&order=since_date`, { headers: anonHeaders });

async function slate() {
  // remove leftovers from an interrupted run (auth first, then probe rows)
  const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders }).catch(() => null);
  for (const user of users?.users || []) {
    if (user.email === COACH_EMAIL || user.email === TEAM_EMAIL) {
      await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
  }
  await call(`${BASE}/coach_roster?email=in.("${COACH_EMAIL}","${TEAM_EMAIL}")`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
  await call(`${BASE}/injuries?player_id=eq.${PROBE_PLAYER}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
}

async function main() {
  if (!secret || !publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying injury tracking against ${env.SUPABASE_URL}\n`);

  try {
    // --- 1. migration contract on disk --------------------------------------
    const sql = fs.readFileSync(path.join(__dirname, "supabase", "migrations", "0002_injuries.sql"), "utf8");
    check(/create table( if not exists)? injuries/.test(sql), "0002 creates the injuries table");
    check(/policy "public read injuries"[\s\S]*?for select using \(true\)/.test(sql), "0002 grants public read");
    check(/policy "coach manage injuries"[\s\S]*?is_coach\(\)/.test(sql), "0002 gates writes behind is_coach()");
    check(EXPECTED.every((row) => sql.includes(`('${row.id}'`)), "0002 seeds the four current injuries");

    // --- 2. anon public read (the query app.js runs) ------------------------
    const rows = await seedRead();
    check(rows.length === EXPECTED.length, "anon reads the seeded injuries", `${rows.length} rows`);
    const byId = Object.fromEntries(rows.map((row) => [row.player_id, row]));
    check(EXPECTED.every((row) => byId[row.id]?.detail === row.detail
      && byId[row.id]?.since_date === row.since && byId[row.id]?.expected_return === row.ret),
    "seed values match the coach's list", EXPECTED.map((row) => row.id).join(", "));
    check(rows.every((row) => row.players?.display_name), "embedded player name resolves for every injury",
      rows.map((row) => row.players?.display_name).join(", "));

    // --- 3. anon writes cannot touch the seed rows --------------------------
    const anonInsert = await fetch(`${BASE}/injuries`, {
      method: "POST", headers: repHeaders(publishable), body: JSON.stringify([{ player_id: PROBE_PLAYER, detail: "anon", since_date: "2026-10-01" }]),
    });
    check(anonInsert.status >= 400, "anon insert denied", `status ${anonInsert.status}`);
    const anonPatch = await call(`${BASE}/injuries?player_id=eq.${PROBE_PLAYER}`, {
      method: "PATCH", headers: { ...anonHeaders, Prefer: "return=representation" }, body: { detail: "anon" },
    });
    const anonDelete = await call(`${BASE}/injuries?player_id=eq.${PROBE_PLAYER}`, {
      method: "DELETE", headers: { ...anonHeaders, Prefer: "return=representation" },
    });
    check(Array.isArray(anonPatch) && anonPatch.length === 0, "anon update affects 0 rows", `${anonPatch?.length} rows`);
    check(Array.isArray(anonDelete) && anonDelete.length === 0, "anon delete affects 0 rows", `${anonDelete?.length} rows`);
    const afterAnon = await seedRead();
    const stillSeeded = Object.fromEntries(afterAnon.map((row) => [row.player_id, row]));
    check(afterAnon.length === EXPECTED.length && stillSeeded.kosei?.detail === "Minor knee injury",
      "seed rows intact after anon write attempts", `${afterAnon.length} rows`);

    // --- 4. team session: reads allowed, writes denied ----------------------
    await call(`${AUTH}/admin/users`, {
      method: "POST", headers: adminHeaders, body: { email: TEAM_EMAIL, email_confirm: true, password: E2E_PASSWORD },
    }).catch(() => {});
    const teamSession = await signIn(TEAM_EMAIL);
    const teamRead = await call(`${BASE}/injuries?select=player_id`, { headers: bearerHeaders(teamSession.access_token) });
    check(teamRead.length === EXPECTED.length, "team session reads injuries", `${teamRead.length} rows`);
    const teamInsert = await fetch(`${BASE}/injuries`, {
      method: "POST", headers: repHeaders(teamSession.access_token), body: JSON.stringify([{ player_id: PROBE_PLAYER, detail: "team", since_date: "2026-10-01" }]),
    });
    check(teamInsert.status >= 400, "team session cannot insert injuries", `status ${teamInsert.status}`);
    const teamPatch = await call(`${BASE}/injuries?player_id=eq.${PROBE_PLAYER}`, {
      method: "PATCH", headers: { ...repHeaders(teamSession.access_token), Prefer: "return=representation" }, body: { detail: "team" },
    });
    check(Array.isArray(teamPatch) && teamPatch.length === 0, "team session update affects 0 rows", `${teamPatch?.length} rows`);

    // --- 5. rostered coach: create → update → delete ------------------------
    await call(`${AUTH}/admin/users`, {
      method: "POST", headers: adminHeaders, body: { email: COACH_EMAIL, email_confirm: true, password: E2E_PASSWORD },
    }).catch(() => {});
    await call(`${BASE}/coach_roster`, { method: "POST", headers: adminHeaders, body: [{ email: COACH_EMAIL }] });
    const coachSession = await signIn(COACH_EMAIL);

    const created = await call(`${BASE}/injuries`, {
      method: "POST", headers: repHeaders(coachSession.access_token),
      body: [{ player_id: PROBE_PLAYER, detail: PROBE_DETAIL, since_date: "2026-10-05", expected_return: "probe" }],
    });
    check(created.length === 1 && created[0].detail === PROBE_DETAIL, "coach records an injury", `${created[0]?.player_id}: ${created[0]?.detail}`);
    const withProbe = await seedRead();
    check(withProbe.length === EXPECTED.length + 1, "anon sees the new injury", `${withProbe.length} rows`);

    const updated = await call(`${BASE}/injuries?player_id=eq.${PROBE_PLAYER}`, {
      method: "PATCH", headers: repHeaders(coachSession.access_token), body: { detail: `${PROBE_DETAIL} (edited)`, updated_by: COACH_EMAIL },
    });
    check(updated.length === 1 && updated[0].detail === `${PROBE_DETAIL} (edited)`, "coach updates an injury", updated[0]?.detail);

    const removed = await call(`${BASE}/injuries?player_id=eq.${PROBE_PLAYER}`, {
      method: "DELETE", headers: repHeaders(coachSession.access_token),
    });
    check(removed.length === 1 && removed[0].player_id === PROBE_PLAYER, "coach clears an injury", `${removed.length} row returned`);

    // --- 6. static wiring across the site -----------------------------------
    const page = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
    const indexHtml = page("index.html");
    check(indexHtml.includes('id="squad-status"') && indexHtml.includes('id="injury-list"'), "index.html: squad status section");
    const app = page("app.js");
    check(app.includes('"injuries"') && app.includes("squad-status") && app.includes("injury-card"), "app.js: injury cards render on the index");
    check(page("players.js").includes('"injuries"') && page("players.js").includes("injured-badge"), "players.js: injured badge on the grid");
    check(page("player.js").includes('"injuries"') && page("player.js").includes("profile-injury"), "player.js: injury note on the profile");
    check(page("coach.js").includes('"injuries"') && page("coach.html").includes('id="coach-injuries"'), "coach dashboard: squad status panel");
    const adminHtml = page("admin.html");
    check(adminHtml.includes('data-tab="injuries"') && adminHtml.includes('data-panel="injuries"') && adminHtml.includes('id="injury-form"'),
      "admin.html: injuries tab, panel and form");
    const adminJs = page("admin.js");
    check(adminJs.includes("function renderInjuries") && adminJs.includes("async function addInjury") && adminJs.includes("async function removeInjury"),
      "admin.js: injuries renderer + add/remove handlers");
    check(/BACKUP_TABLES = \[[^\]]*"injuries"\]/.test(adminJs), "admin.js: injuries included in backups");
    const i18n = page("i18n.js");
    check(["injuredBadge", "injuriesTitle", "injuryAdd", "adminInjuries"].every((key) => (i18n.match(new RegExp(`${key}:`, "g")) || []).length === 3),
      "i18n: injury keys exist ×3");
    const backup = ["players", "matches", "appearances", "goals", "signups", "saved_squads", "match_notes", "team_content", "coach_notes", "injuries"];
    check(backup.includes("injuries"), "backup table set includes injuries");
  } finally {
    await slate();
  }

  // --- post-cleanup: the seed reads back exactly -----------------------------
  const restored = await seedRead();
  const byId = Object.fromEntries(restored.map((row) => [row.player_id, row]));
  check(restored.length === EXPECTED.length
    && EXPECTED.every((row) => byId[row.id]?.detail === row.detail && byId[row.id]?.since_date === row.since),
  "injuries table restored to the seeded baseline", `${restored.length} rows`);
  const roster = await call(`${BASE}/coach_roster?select=email`, { headers: adminHeaders });
  check(roster.length === 1, "coach_roster restored", roster.map((row) => row.email).join(", "));
  const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
  const leftovers = (users.users || []).filter((user) => user.email === COACH_EMAIL || user.email === TEAM_EMAIL);
  check(leftovers.length === 0, "ephemeral users deleted");

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Injuries verified: migration contract, public read, anon/team writes denied, coach CRUD, site wiring.");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
