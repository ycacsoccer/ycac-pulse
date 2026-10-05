// Data-path + static check for the squad picker (squad-picker.html/js/css):
//   node verify-picker.cjs
// Drives the exact calls the page makes:
//   anon blocked → team session runs the 6 picker queries → team writes denied
//   → core-weighted suggest inputs via stats.js → coach save flow against a
//   probe fixture (deactivate-then-insert, loadSavedLineup semantics) →
//   everything removed afterwards.
// Ephemeral users only (e2e-picker-*@ycac-pulse.test), deleted even on failure.
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

const TEAM_EMAIL = "e2e-picker-team@ycac-pulse.test";
const COACH_EMAIL = "e2e-picker-coach@ycac-pulse.test";
const E2E_PASSWORD = "E2e-Verify-2026!";
const PROBE_MATCH = "e2e-picker-match";
const PROBE_SQUAD = "e2e-picker-sq";

const failures = [];
const check = (ok, label, detail = "") => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function call(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : []; } catch (error) { data = text; }
  return { status: response.status, ok: response.ok, data, text };
}

async function count(table, headers) {
  const response = await fetch(`${BASE}/${table}?select=*`, { headers: { ...headers, Prefer: "count=exact" } });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return Number(response.headers.get("content-range")?.split("/")[1] ?? "NaN");
}

const signIn = (email, password) =>
  call(`${AUTH}/token?grant_type=password`, { method: "POST", headers: anonHeaders, body: { email, password } });

const YCACStats = require("./stats.js");

async function cleanup({ rosterAdded, users }) {
  await call(`${BASE}/saved_squads?match_id=eq.${PROBE_MATCH}`, { method: "DELETE", headers: adminHeaders });
  await call(`${BASE}/matches?id=eq.${PROBE_MATCH}`, { method: "DELETE", headers: adminHeaders });
  if (rosterAdded) await call(`${BASE}/coach_roster?email=eq.${COACH_EMAIL}`, { method: "DELETE", headers: adminHeaders });
  for (const user of users) {
    await call(`${AUTH}/admin/users/${user}`, { method: "DELETE", headers: adminHeaders });
  }
}

async function main() {
  if (!secret || !publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying squad picker against ${env.SUPABASE_URL}\n`);

  // --- 0. static contract (no network) ---------------------------------------
  const picker = fs.readFileSync(path.join(__dirname, "squad-picker.js"), "utf8");
  const page = fs.readFileSync(path.join(__dirname, "squad-picker.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "squad-picker.css"), "utf8");
  const i18n = fs.readFileSync(path.join(__dirname, "i18n.js"), "utf8");
  check(!picker.includes("docs.google.com") && !picker.includes("script.google.com") && !picker.includes("spreadsheets"), "gviz + Apps Script endpoints are gone");
  check(!picker.includes("getSheet") && !picker.includes("squadSaveEndpoint"), "sheet loader + save endpoint references are gone");
  check(picker.includes("YCACData.select") && picker.includes('"saved_squads"') && picker.includes('"signups"'), "picker reads Supabase (6 selects)");
  check(picker.includes("YCACAuth.requireTeam") && picker.includes("YCACAuth.isCoach"), "team-gated boot + coach-only save button");
  check(picker.includes("photoCell") && picker.includes("photo_path"), "roster cards carry photos");
  check(picker.includes("YCACStats.computeSeason") && picker.includes("tierRank"), "core-weighted suggest via stats.js");
  check(page.includes('<script src="stats.js">') && page.includes("noindex"), "squad-picker.html loads stats.js + is noindexed");
  check(css.includes(".player-card .monogram") && css.includes("grid-template-columns: 2rem 1.6rem"), "photo column styles present");
  check((i18n.match(/pickerStatusCleared:/g) || []).length === 3, "pickerStatusCleared translated ×3", `${(i18n.match(/pickerStatusCleared:/g) || []).length}/3`);
  check(!i18n.includes("pickerSubmitted") && !i18n.split("\n").filter((line) => line.includes("pickerSaveSuccess")).some((line) => line.includes("Google Sheets")), "sheet-era save strings removed");

  const state = { rosterAdded: false, users: [] };
  let squadsTotal = 0;

  try {
    // --- clean slate (leftovers from an interrupted earlier run) --------------
    await cleanup({ rosterAdded: true, users: [] });
    const existing = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
    for (const user of existing.data?.users || []) {
      if (user.email === TEAM_EMAIL || user.email === COACH_EMAIL) {
        await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
      }
    }

    // --- baselines ------------------------------------------------------------
    const signupsTotal = await count("signups", adminHeaders);
    squadsTotal = await count("saved_squads", adminHeaders);
    const rosterTotal = await count("coach_roster", adminHeaders);
    check(signupsTotal > 0 && squadsTotal > 0 && rosterTotal === 1, "baselines read with secret key", `${signupsTotal} signups, ${squadsTotal} saved rows`);

    // --- 1. anon: the page gates before any query ------------------------------
    check((await count("signups", anonHeaders)) === 0, "anon sees 0 signups (requireTeam needed)");
    check((await count("saved_squads", anonHeaders)) === 0, "anon sees 0 saved squads");

    // --- 2. ephemeral users ----------------------------------------------------
    const team = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: TEAM_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    check(team.ok && team.data?.id, "create ephemeral team user", TEAM_EMAIL);
    if (team.data?.id) state.users.push(team.data.id);
    const coach = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: COACH_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    check(coach.ok && coach.data?.id, "create ephemeral coach user", COACH_EMAIL);
    if (coach.data?.id) state.users.push(coach.data.id);
    const rosterRow = await call(`${BASE}/coach_roster`, { method: "POST", headers: adminHeaders, body: [{ email: COACH_EMAIL }] });
    state.rosterAdded = rosterRow.ok;
    check(rosterRow.ok, "roster the e2e coach");

    // --- 3. team session runs the picker's exact 6 queries ---------------------
    const teamGrant = await signIn(TEAM_EMAIL, E2E_PASSWORD);
    check(teamGrant.ok && teamGrant.data?.access_token, "team password grant", `status ${teamGrant.status}`);
    const teamToken = teamGrant.data?.access_token;
    if (!teamToken) throw new Error("cannot continue without a team token");

    const [players, matches, appearances, goals, signups, savedSquads] = await Promise.all([
      call(`${BASE}/players?select=*&order=display_name`, { headers: bearerHeaders(teamToken) }),
      call(`${BASE}/matches?select=*&order=date`, { headers: bearerHeaders(teamToken) }),
      call(`${BASE}/appearances?select=*`, { headers: bearerHeaders(teamToken) }),
      call(`${BASE}/goals?select=*`, { headers: bearerHeaders(teamToken) }),
      call(`${BASE}/signups?select=match_id,player_id,status`, { headers: bearerHeaders(teamToken) }),
      call(`${BASE}/saved_squads?select=*`, { headers: bearerHeaders(teamToken) }),
    ]);
    check(players.ok && players.data.length >= 30 && players.data.every((p) => p.id && p.display_name && "photo_path" in p && "active" in p), "picker query: players (photoCell fields present)", `${players.data.length} rows`);
    check(matches.ok && matches.data.length >= 10 && matches.data.every((m) => m.id && m.date && m.competition && "ycac_goals" in m), "picker query: matches (nullable scores)", `${matches.data.length} rows`);
    check(appearances.ok && appearances.data.length >= 100, "picker query: appearances", `${appearances.data.length} rows`);
    check(goals.ok && goals.data.length >= 30, "picker query: goals", `${goals.data.length} rows`);
    check(signups.ok && signups.data.length === signupsTotal && signups.data.every((s) => s.match_id && s.player_id && s.status), "picker query: signups (signup lookup shape)", `${signups.data.length}/${signupsTotal}`);
    check(savedSquads.ok && savedSquads.data.length === squadsTotal && savedSquads.data.every((s) => s.saved_squad_id && s.formation && s.selection_type && "slot_order" in s && "active" in s), "picker query: saved squads (loadSavedLineup shape)", `${savedSquads.data.length}/${squadsTotal}`);

    // --- 4. team writes stay denied ---------------------------------------------
    const teamInsert = await call(`${BASE}/saved_squads`, { method: "POST", headers: bearerHeaders(teamToken), body: [{ saved_squad_id: PROBE_SQUAD, match_id: matches.data[0].id, formation: "4-2-3-1", player_id: players.data[0].id, selection_type: "starter" }] });
    check(teamInsert.status === 401 || teamInsert.status === 403, "team insert into saved_squads denied", `status ${teamInsert.status}`);

    // --- 5. core-weighted suggest inputs (stats.js over the picker data) --------
    const season = YCACStats.computeSeason({ players: players.data, matches: matches.data, appearances: appearances.data, goals: goals.data });
    const active = players.data.filter((p) => p.active !== false);
    check(season.tiers.core.length >= 1 && active.length > 0, "suggest has a core tier to draw from", `core ${season.tiers.core.length} of ${active.length}`);
    const TIER_RANK = { core: 0, rotation: 1, depth: 2, inactive: 3 };
    const rankedOk = [...season.players].every((entry) => Number.isInteger(TIER_RANK[entry.tier]) && entry.id && entry.display_name);
    check(rankedOk, "every suggest candidate has a tier + link target", `${season.players.length} candidates`);
    const fixtures = matches.data.filter((m) => !YCACStats.isFinal(m));
    const eligible = (match) => signups.data.filter((s) => s.match_id === match.id && !["declined", "unavailable"].includes(String(s.status).toLowerCase())).length;
    check(fixtures.length === 0 || fixtures.some((match) => eligible(match) >= 1), "available-player pool (non-declined signups) is non-empty",
      `${fixtures.length} fixture(s)${fixtures.length ? ` · next has ${eligible(fixtures[0])} eligible` : " (all played)"}`);

    // --- 6. coach save flow against a probe fixture ------------------------------
    const coachGrant = await signIn(COACH_EMAIL, E2E_PASSWORD);
    const coachToken = coachGrant.data?.access_token;
    check(coachGrant.ok && coachToken, "coach password grant", `status ${coachGrant.status}`);
    if (!coachToken) throw new Error("cannot continue without a coach token");

    const probeMatch = await call(`${BASE}/matches`, { method: "POST", headers: adminHeaders, body: [{ id: PROBE_MATCH, date: "2027-01-01", competition: "Friendly Match", opponent: "E2E Probe FC" }] });
    check(probeMatch.ok, "probe fixture inserted", PROBE_MATCH);
    const [probePlayerA, probePlayerB] = players.data.slice(0, 2);

    // saveSquad step 1 — retire previous saves (none yet → 0 rows, 200)
    const retire0 = await call(`${BASE}/saved_squads?match_id=eq.${PROBE_MATCH}&active=eq.true`, { method: "PATCH", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" }, body: { active: false } });
    check(retire0.ok && Array.isArray(retire0.data) && retire0.data.length === 0, "coach deactivates previous save (no rows yet)", `status ${retire0.status}`);

    // saveSquad step 2 — insert the new group
    const group1 = await call(`${BASE}/saved_squads`, { method: "POST", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" }, body: [
      { saved_squad_id: PROBE_SQUAD, match_id: PROBE_MATCH, formation: "4-2-3-1", player_id: probePlayerA.id, selection_type: "starter", slot_order: 0, saved_by: COACH_EMAIL },
      { saved_squad_id: PROBE_SQUAD, match_id: PROBE_MATCH, formation: "4-2-3-1", player_id: probePlayerB.id, selection_type: "sub", slot_order: 1, saved_by: COACH_EMAIL },
    ] });
    check(group1.ok && group1.data?.length === 2, "coach saves a squad group (2 rows)", `${group1.data?.length ?? 0} rows`);

    // team session reads it back (picker loadSavedLineup input)
    const teamRead = await call(`${BASE}/saved_squads?match_id=eq.${PROBE_MATCH}`, { headers: bearerHeaders(teamToken) });
    check(teamRead.ok && teamRead.data.length === 2 && teamRead.data.every((r) => r.saved_squad_id === PROBE_SQUAD && r.saved_by === COACH_EMAIL), "team session reads the saved squad", `${teamRead.data.length} rows`);

    // team tries the picker's deactivate step → must be a no-op
    const teamRetire = await call(`${BASE}/saved_squads?match_id=eq.${PROBE_MATCH}&active=eq.true`, { method: "PATCH", headers: { ...bearerHeaders(teamToken), Prefer: "return=representation" }, body: { active: false } });
    const stillActive = await call(`${BASE}/saved_squads?match_id=eq.${PROBE_MATCH}&active=eq.true`, { headers: bearerHeaders(teamToken) });
    check(teamRetire.ok && Array.isArray(teamRetire.data) && teamRetire.data.length === 0 && stillActive.data.length === 2, "team deactivate attempt is a no-op (200 + rows stay active)", `status ${teamRetire.status}`);

    // second save on the same fixture — old group retired, exactly one active group left
    const retire1 = await call(`${BASE}/saved_squads?match_id=eq.${PROBE_MATCH}&active=eq.true`, { method: "PATCH", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" }, body: { active: false } });
    check(retire1.ok && retire1.data.length === 2, "second save retires the previous group", `${retire1.data.length} rows deactivated`);
    const group2 = await call(`${BASE}/saved_squads`, { method: "POST", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" }, body: [
      { saved_squad_id: `${PROBE_SQUAD}-2`, match_id: PROBE_MATCH, formation: "4-4-2", player_id: probePlayerB.id, selection_type: "starter", slot_order: 0, saved_by: COACH_EMAIL },
    ] });
    check(group2.ok && group2.data?.length === 1, "second save inserts a new group");
    const activeGroups = await call(`${BASE}/saved_squads?match_id=eq.${PROBE_MATCH}&active=eq.true`, { headers: bearerHeaders(teamToken) });
    const groupIds = [...new Set(activeGroups.data.map((r) => r.saved_squad_id))];
    check(groupIds.length === 1 && groupIds[0] === `${PROBE_SQUAD}-2`, "exactly one active group → loadSavedLineup picks the latest save", `${activeGroups.data.length} row(s) in ${groupIds.join(",")}`);
  } finally {
    await cleanup(state);
  }

  // --- 7. clean slate restored --------------------------------------------------
  const squadsLeft = await count("saved_squads", adminHeaders);
  check(squadsLeft === squadsTotal, "saved_squads restored (no leftovers)", `${squadsLeft} of ${squadsTotal}`);
  const matchesLeft = await call(`${BASE}/matches?id=eq.${PROBE_MATCH}`, { headers: adminHeaders });
  check((matchesLeft.data || []).length === 0, "probe fixture deleted");
  const rosterLeft = await count("coach_roster", adminHeaders);
  check(rosterLeft === 1, "coach_roster restored", `${rosterLeft} row`);
  const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
  const leftovers = (users.data?.users || []).filter((u) => u.email === TEAM_EMAIL || u.email === COACH_EMAIL);
  check(leftovers.length === 0, "ephemeral users deleted");

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Squad picker verified: gated queries, coach-only save, core-weighted suggest, static contract.");
}

main().catch(async (error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
