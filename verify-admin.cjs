// Data-path check for the admin tool (admin.html + admin.js):
//   node verify-admin.cjs
// Signs in an ephemeral COACH user (rostered) and runs every flow the page
// offers: player create/patch, fixture create/score, lineup & goals replace,
// signups entry with entered_by, match_notes upsert, team_content upsert
// (captured + restored), the 9-table backup query set, cascade deletes — plus
// an ephemeral TEAM user to prove writes are denied for non-coaches.
// Everything it creates is removed afterwards.
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

const COACH_EMAIL = "e2e-admin-coach@ycac-pulse.test";
const TEAM_EMAIL = "e2e-admin-team@ycac-pulse.test";
const E2E_PASSWORD = "E2e-Verify-2026!";
const P1 = "e2e-admin-player";
const P2 = "e2e-admin-player-2";
const MATCH = "e2e-admin-match";

// The exact query strings admin.js runs.
const QUERIES = {
  players: "select=*&order=display_name",
  matches: "select=*&order=date.desc",
  appearances: "select=*",
  goals: "select=*",
  signups: "select=*",
  match_notes: "select=*",
  team_content: "select=*",
};
// …and the exact table set the backup button exports.
const BACKUP_TABLES = ["players", "matches", "appearances", "goals", "signups", "saved_squads", "match_notes", "team_content", "coach_notes"];

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

async function slate() {
  // remove leftovers from an interrupted run (auth first, then probe rows)
  const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders }).catch(() => null);
  for (const user of users?.users || []) {
    if (user.email === COACH_EMAIL || user.email === TEAM_EMAIL) {
      await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
  }
  await call(`${BASE}/coach_roster?email=in.("${COACH_EMAIL}","${TEAM_EMAIL}")`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
  await call(`${BASE}/matches?id=eq.${MATCH}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
  await call(`${BASE}/players?id=in.("${P1}","${P2}")`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
}

async function main() {
  if (!secret || !publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying admin tool against ${env.SUPABASE_URL}\n`);

  const state = { contentCaptured: false, contentOriginal: null, contentModified: false };

  try {
    await slate();

    // --- 1. anon sees nothing on the admin's team tables ---------------------
    for (const table of ["signups", "match_notes", "team_content", "coach_notes"]) {
      const rows = await call(`${BASE}/${table}?select=*`, { headers: anonHeaders });
      check(Array.isArray(rows) && rows.length === 0, `anon sees 0 rows on ${table}`, `${rows.length}`);
    }

    // --- 2. ephemeral coach (rostered) + team (read-only) users -------------
    const existing = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
    for (const user of existing.users || []) {
      if (user.email === COACH_EMAIL || user.email === TEAM_EMAIL) {
        await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
      }
    }
    const coach = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: COACH_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    const team = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: TEAM_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    await call(`${BASE}/coach_roster`, { method: "POST", headers: adminHeaders, body: [{ email: COACH_EMAIL }] });
    check(Boolean(coach.id && team.id), "ephemeral coach + team users created");

    const coachToken = (await signIn(COACH_EMAIL)).access_token;
    const teamToken = (await signIn(TEAM_EMAIL)).access_token;
    check(Boolean(coachToken && teamToken), "password grants (coach + team sessions)");

    const coachRpc = await call(`${BASE}/rpc/is_coach`, { method: "POST", headers: bearerHeaders(coachToken), body: {} });
    const teamRpc = await call(`${BASE}/rpc/is_coach`, { method: "POST", headers: bearerHeaders(teamToken), body: {} });
    check(coachRpc === true, "coach session passes requireCoach (is_coach)");
    check(teamRpc === false, "team session fails requireCoach", String(teamRpc));

    // --- 3. the page's exact queries, with the coach session ----------------
    const data = {};
    await Promise.all(Object.entries(QUERIES).map(async ([table, query]) => {
      data[table] = await call(`${BASE}/${table}?${query}`, { headers: bearerHeaders(coachToken) });
    }));
    check(data.players.length >= 30, "players query", `${data.players.length} rows`);
    check(data.players.every((row, i, list) => i === 0 || list[i - 1].display_name.localeCompare(row.display_name) <= 0), "players ordered by name");
    check(data.matches.length >= 10, "matches query", `${data.matches.length} rows`);
    check(data.matches.every((row, i, list) => i === 0 || list[i - 1].date >= row.date), "matches ordered date desc");
    check(data.appearances.length >= 100 && data.goals.length >= 30, "appearances + goals queries", `${data.appearances.length} apps, ${data.goals.length} goals`);
    check(Array.isArray(data.signups) && data.signups.length > 0, "signups query", `${data.signups.length} rows`);
    check(Array.isArray(data.match_notes) && Array.isArray(data.team_content), "match_notes + team_content queries", `${data.match_notes.length} notes, ${data.team_content.length} pages`);

    // --- 4. players: create → patch, and team writes denied ------------------
    const probe = { id: P1, display_name: "E2E Admin Probe", shirt_number: 99, primary_position: "ST", secondary_positions: ["AT"], preferred_foot: "right", active: true };
    const created = await call(`${BASE}/players`, { method: "POST", headers: repHeaders(coachToken), body: [probe] });
    check(created.length === 1 && created[0].id === P1, "coach creates a player", created[0]?.id);
    const created2 = await call(`${BASE}/players`, { method: "POST", headers: repHeaders(coachToken), body: [{ id: P2, display_name: "E2E Admin Probe Two", primary_position: "CB", active: true }] });
    check(created2.length === 1 && created2[0].id === P2, "coach creates a second player", created2[0]?.id);

    const patched = await call(`${BASE}/players?id=eq.${P1}`, { method: "PATCH", headers: repHeaders(coachToken), body: { display_name: "E2E Admin Probe (edited)", bio: "profile edited in admin" } });
    check(patched.length === 1 && patched[0].display_name === "E2E Admin Probe (edited)" && patched[0].bio, "coach patches a player", patched[0]?.display_name);

    const teamInsert = await fetch(`${BASE}/players`, {
      method: "POST", headers: repHeaders(teamToken), body: JSON.stringify([{ id: "e2e-admin-should-fail", display_name: "Nope" }]),
    });
    check(teamInsert.status >= 400, "team session cannot create players", `status ${teamInsert.status}`);
    const teamUpdate = await call(`${BASE}/players?id=eq.${P1}`, { method: "PATCH", headers: repHeaders(teamToken), body: { display_name: "Nope" } });
    check(Array.isArray(teamUpdate) && teamUpdate.length === 0, "team session update affects 0 rows", `${teamUpdate?.length} rows`);
    const stillOurs = await call(`${BASE}/players?id=eq.${P1}&select=display_name`, { headers: bearerHeaders(coachToken) });
    check(stillOurs[0]?.display_name === "E2E Admin Probe (edited)", "player name untouched by team PATCH", stillOurs[0]?.display_name);

    // --- 5. matches: create → score → lineup & goals replace ----------------
    const matchRow = {
      id: MATCH, date: "2026-12-01", competition: "Friendly Match", opponent: "E2E FC",
      venue: "Test Ground", home_away: "home", ycac_goals: null, opponent_goals: null,
      kickoff: "15:00", standard_signup_url: null, priority_signup_url: null,
    };
    const match = await call(`${BASE}/matches`, { method: "POST", headers: repHeaders(coachToken), body: [matchRow] });
    check(match.length === 1 && match[0].id === MATCH && match[0].ycac_goals === null, "coach creates a fixture", `${match[0]?.id} vs ${match[0]?.opponent}`);

    const scored = await call(`${BASE}/matches?id=eq.${MATCH}`, { method: "PATCH", headers: repHeaders(coachToken), body: { ycac_goals: 3, opponent_goals: 1 } });
    check(scored.length === 1 && scored[0].ycac_goals === 3 && scored[0].opponent_goals === 1, "coach enters a result", `${scored[0]?.ycac_goals}–${scored[0]?.opponent_goals}`);

    // lineup replace, exactly like saveMatch(): delete the match's rows, insert the new set
    await call(`${BASE}/appearances`, { method: "POST", headers: repHeaders(coachToken), body: [
      { match_id: MATCH, player_id: P1, role: "starter", position: "ST" },
      { match_id: MATCH, player_id: P2, role: "starter", position: "MF" },
    ] });
    await call(`${BASE}/appearances?match_id=eq.${MATCH}`, { method: "DELETE", headers: repHeaders(coachToken) });
    await call(`${BASE}/appearances`, { method: "POST", headers: repHeaders(coachToken), body: [
      { match_id: MATCH, player_id: P1, role: "sub", position: "ST" },
      { match_id: MATCH, player_id: P2, role: "starter", position: "CB" },
    ] });
    const lineup = await call(`${BASE}/appearances?match_id=eq.${MATCH}&select=*`, { headers: bearerHeaders(coachToken) });
    const roleOf = (id) => lineup.find((row) => row.player_id === id)?.role;
    check(lineup.length === 2 && roleOf(P1) === "sub" && roleOf(P2) === "starter", "lineup replaced (delete → insert)", `${lineup.length} rows, ${roleOf(P1)}/${roleOf(P2)}`);

    await call(`${BASE}/goals?match_id=eq.${MATCH}`, { method: "DELETE", headers: repHeaders(coachToken) }).catch(() => {});
    const goals = await call(`${BASE}/goals`, { method: "POST", headers: repHeaders(coachToken), body: [{ match_id: MATCH, scorer_id: P1, assist_id: P2, minute: 42 }] });
    check(goals.length === 1 && goals[0].minute === 42 && goals[0].assist_id === P2, "goals & assists entered", `${goals[0]?.scorer_id} ${goals[0]?.minute}' from ${goals[0]?.assist_id}`);

    // --- 6. signups entry records who entered it ----------------------------
    const stamp = { responded_at: new Date().toISOString(), entered_by: COACH_EMAIL };
    const signup = await call(`${BASE}/signups`, { method: "POST", headers: repHeaders(coachToken), body: [{ match_id: MATCH, player_id: P1, status: "confirmed", ...stamp }] });
    check(signup.length === 1 && signup[0].entered_by === COACH_EMAIL && signup[0].status === "confirmed", "signup entered with entered_by", `${signup[0]?.status} by ${signup[0]?.entered_by}`);
    const flipped = await call(`${BASE}/signups?match_id=eq.${MATCH}&player_id=eq.${P1}`, { method: "PATCH", headers: repHeaders(coachToken), body: { status: "declined", ...stamp } });
    check(flipped.length === 1 && flipped[0].status === "declined", "signup status updated", flipped[0]?.status);

    // --- 7. match_notes upsert (requirement 6) ------------------------------
    const note = await call(`${BASE}/match_notes`, { method: "POST", headers: repHeaders(coachToken), body: [{ match_id: MATCH, reflection: "Strong first half.", updated_at: stamp.responded_at, updated_by: COACH_EMAIL }] });
    check(note.length === 1 && note[0].reflection === "Strong first half.", "match_notes created", note[0]?.match_id);
    const noteUpd = await call(`${BASE}/match_notes?match_id=eq.${MATCH}`, { method: "PATCH", headers: repHeaders(coachToken), body: { coaching_points: "Hold the line higher.", updated_at: new Date().toISOString(), updated_by: COACH_EMAIL } });
    check(noteUpd.length === 1 && noteUpd[0].coaching_points === "Hold the line higher.", "match_notes updated", noteUpd[0]?.coaching_points?.slice(0, 24));

    // --- 8. team_content upsert — capture first, restore in finally (req 7) --
    const original = await call(`${BASE}/team_content?slug=eq.club-info&select=*`, { headers: adminHeaders });
    state.contentCaptured = true;
    state.contentOriginal = original[0] || null;
    state.contentModified = true; // from here on, finally must restore
    if (original[0]) {
      const upd = await call(`${BASE}/team_content?slug=eq.club-info`, { method: "PATCH", headers: repHeaders(coachToken), body: { title: original[0].title, body: original[0].body } });
      check(upd.length === 1 && upd[0].slug === "club-info", "coach edits existing team_content", upd[0]?.slug);
    } else {
      const ins = await call(`${BASE}/team_content`, { method: "POST", headers: repHeaders(coachToken), body: [{ slug: "club-info", title: "Club info", body: "e2e probe content" }] });
      check(ins.length === 1 && ins[0].slug === "club-info", "coach creates team_content", ins[0]?.slug);
    }

    // --- 9. backup: the exact 9-table export set ----------------------------
    const backup = {};
    await Promise.all(BACKUP_TABLES.map(async (table) => {
      backup[table] = await call(`${BASE}/${table}?select=*`, { headers: bearerHeaders(coachToken) });
    }));
    check(BACKUP_TABLES.every((table) => Array.isArray(backup[table])),
      "backup exports every table", BACKUP_TABLES.map((table) => `${table}:${backup[table].length}`).join(" "));
    check(Array.isArray(backup.coach_notes), "coach_notes readable with a coach session", `${backup.coach_notes.length} rows`);

    // --- 10. delete the fixture → everything cascades -----------------------
    await call(`${BASE}/matches?id=eq.${MATCH}`, { method: "DELETE", headers: repHeaders(coachToken) });
    const orphaned = await Promise.all(["appearances", "goals", "signups", "match_notes"].map((table) =>
      call(`${BASE}/${table}?match_id=eq.${MATCH}&select=*`, { headers: bearerHeaders(coachToken) })));
    check(orphaned.every((rows) => rows.length === 0), "deleting a fixture cascades to apps/goals/signups/notes",
      orphaned.map((rows, index) => `${["apps", "goals", "signups", "notes"][index]}:${rows.length}`).join(" "));

    // --- 11. delete the probe players (references cleared by the cascade) ----
    await call(`${BASE}/players?id=in.("${P1}","${P2}")`, { method: "DELETE", headers: repHeaders(coachToken) });
    const remaining = await call(`${BASE}/players?id=in.("${P1}","${P2}")&select=id`, { headers: adminHeaders });
    check(remaining.length === 0, "coach deletes the probe players", `${remaining.length} left`);
  } finally {
    // restore everything this run touched
    if (state.contentModified) {
      if (state.contentCaptured && state.contentOriginal) {
        await call(`${BASE}/team_content?slug=eq.club-info`, { method: "PATCH", headers: adminHeaders, body: { title: state.contentOriginal.title, body: state.contentOriginal.body } }).catch(() => {});
      } else {
        await call(`${BASE}/team_content?slug=eq.club-info`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
      }
    }
    await slate();
  }

  // --- post-cleanup: everything is back --------------------------------------
  const content = await call(`${BASE}/team_content?slug=eq.club-info&select=title,body`, { headers: adminHeaders });
  const restored = state.contentOriginal
    ? content[0]?.title === state.contentOriginal.title && content[0]?.body === state.contentOriginal.body
    : content.length === 0;
  check(restored, "team_content restored to original state", state.contentOriginal ? "edited row reverted" : "probe row removed");
  const probes = await call(`${BASE}/players?id=in.("${P1}","${P2}")&select=id`, { headers: adminHeaders });
  const probeMatch = await call(`${BASE}/matches?id=eq.${MATCH}&select=id`, { headers: adminHeaders });
  check(probes.length === 0 && probeMatch.length === 0, "probe player + fixture rows removed", `${probes.length} players, ${probeMatch.length} matches`);
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
  console.log("Admin tool verified: players, fixtures, lineup/goals, signups, notes, content, backup, RLS.");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
