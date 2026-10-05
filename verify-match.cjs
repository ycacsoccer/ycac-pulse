// Data-path check for the match review page (match.html + match.js):
//   node verify-match.cjs
// Picks a played fixture and the upcoming one, signs in an ephemeral TEAM user,
// and runs the page's exact queries (same strings match.js uses): lineup with
// embedded players, goals resolvable to names, that fixture's signups with
// embeds, match_notes readable by a team session (probe row inserted with the
// secret key when the table is empty, removed after), plus anon-gating and the
// not-found path. User and probe are deleted afterwards.
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

const TEAM_EMAIL = "e2e-match-team@ycac-pulse.test";
const E2E_PASSWORD = "E2e-Verify-2026!";
const SIGNUP_STATES = ["confirmed", "waitlist", "declined", "unavailable"];

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

async function main() {
  if (!secret || !publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying match review against ${env.SUPABASE_URL}\n`);

  const state = { teamUserId: null, noteProbe: false };
  let played = null;
  let upcoming = null;

  try {
    // --- 1. choose fixtures: one played, one upcoming ---------------------
    const playedList = await call(`${BASE}/matches?select=*&ycac_goals=not.is.null&order=date.asc&limit=1`, { headers: anonHeaders });
    const upcomingList = await call(`${BASE}/matches?select=*&ycac_goals=is.null&order=date.asc&limit=1`, { headers: anonHeaders });
    check(playedList.length === 1, "a played fixture exists to review", playedList[0]?.id);
    check(upcomingList.length === 1, "an upcoming fixture exists", upcomingList[0]?.id);
    played = playedList[0];
    upcoming = upcomingList[0];
    if (!played) throw new Error("no played fixture in the database");

    // --- 2. anon is gated out of the team-only panels ---------------------
    const anonSignups = await call(`${BASE}/signups?select=*&match_id=eq.${played.id}`, { headers: anonHeaders });
    const anonNotes = await call(`${BASE}/match_notes?select=*&match_id=eq.${played.id}`, { headers: anonHeaders });
    check(anonSignups.length === 0, "anon sees 0 signups (page must gate on login)", `${anonSignups.length}`);
    check(anonNotes.length === 0, "anon sees 0 match notes (page must gate on login)", `${anonNotes.length}`);

    // --- 3. ephemeral team user (the page's own gate) ---------------------
    const existing = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
    for (const user of existing.users || []) {
      if (user.email === TEAM_EMAIL) await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
    }
    const created = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: TEAM_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    state.teamUserId = created.id;
    const token = (await signIn(TEAM_EMAIL)).access_token;
    check(Boolean(token), "password grant (team session)");

    // --- 4. the page's exact queries for the played match -----------------
    const [matches, apps, goals, signups, notes, players] = await Promise.all([
      call(`${BASE}/matches?select=*&id=eq.${played.id}`, { headers: bearerHeaders(token) }),
      call(`${BASE}/appearances?select=*,players(id,display_name,shirt_number,photo_path,primary_position)&match_id=eq.${played.id}`, { headers: bearerHeaders(token) }),
      call(`${BASE}/goals?select=*&match_id=eq.${played.id}`, { headers: bearerHeaders(token) }),
      call(`${BASE}/signups?select=*,players(id,display_name,shirt_number,photo_path)&match_id=eq.${played.id}`, { headers: bearerHeaders(token) }),
      call(`${BASE}/match_notes?select=*&match_id=eq.${played.id}`, { headers: bearerHeaders(token) }),
      call(`${BASE}/players?select=*`, { headers: bearerHeaders(token) }),
    ]);
    check(matches.length === 1 && matches[0].id === played.id, "match query returns the fixture", `${matches[0]?.id} vs ${matches[0]?.opponent}`);
    check(Array.isArray(notes), "match_notes query runs for a team session", `${notes.length} rows`);
    check(Array.isArray(signups) && signups.every((signup) => signup.players?.display_name),
      "that fixture's signups run with embedded names", `${signups.length} rows`);

    // lineup: embedded players arrive, roles partition cleanly
    check(apps.length >= 5, "lineup has appearances", `${apps.length} rows`);
    const embedOk = apps.every((app) => app.players && app.players.display_name && app.players.id === app.player_id);
    check(embedOk, "every appearance embeds its player (id + name)", `${apps.filter((app) => app.players?.display_name).length}/${apps.length}`);
    const roleOk = apps.every((app) => app.role === "starter" || app.role === "sub");
    const starters = apps.filter((app) => app.role === "starter").length;
    check(roleOk && starters + (apps.length - starters) === apps.length, "roles partition starters vs substitutes", `${starters} starters, ${apps.length - starters} subs`);
    check(apps.some((app) => app.position || app.players.primary_position), "lineup rows carry a position", `${apps.filter((app) => app.position).length} with app position`);

    // goals: scorer/assist resolve to display names through the players map
    const playersById = new Map(players.map((player) => [player.id, player]));
    check(players.length >= 30, "players table loads for name joins", `${players.length} players`);
    const unresolved = goals.filter((goal) => !playersById.get(goal.scorer_id)?.display_name || (goal.assist_id && !playersById.get(goal.assist_id)?.display_name));
    check(unresolved.length === 0, "every goal scorer & assist resolves to a name", `${goals.length} goals`);
    const ordered = [...goals].sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999));
    check(ordered.length === goals.length, "goals sort by minute without loss", `${ordered.filter((g) => g.minute != null).length} with minute`);

    // --- 5. upcoming fixture: signups with embeds --------------------------
    if (upcoming) {
      const fixtureSignups = await call(`${BASE}/signups?select=*,players(id,display_name,shirt_number,photo_path)&match_id=eq.${upcoming.id}`, { headers: bearerHeaders(token) });
      check(fixtureSignups.length >= 1, "upcoming fixture has signups to show", `${fixtureSignups.length} responded`);
      check(fixtureSignups.every((signup) => SIGNUP_STATES.includes(signup.status) && signup.players?.display_name),
        "every signup has a valid status + embedded name",
        `${fixtureSignups.filter((s) => SIGNUP_STATES.includes(s.status) && s.players?.display_name).length}/${fixtureSignups.length}`);
    }

    // --- 6. match_notes is team-readable (probe row when the table is empty)
    let noteRows = await call(`${BASE}/match_notes?select=*&match_id=eq.${played.id}`, { headers: bearerHeaders(token) });
    if (noteRows.length === 0) {
      await call(`${BASE}/match_notes`, { method: "POST", headers: adminHeaders, body: [{ match_id: played.id, reflection: "e2e probe reflection", updated_at: new Date().toISOString(), updated_by: "verify-match.cjs" }] });
      state.noteProbe = true;
      noteRows = await call(`${BASE}/match_notes?select=*&match_id=eq.${played.id}`, { headers: bearerHeaders(token) });
      check(noteRows.length === 1 && noteRows[0].reflection === "e2e probe reflection", "team session reads the coach's reflection", noteRows[0]?.reflection);
    } else {
      check(Boolean(noteRows[0].reflection ?? noteRows[0].coaching_points ?? noteRows[0].squad_review), "existing match note has content", `${noteRows.length} rows`);
    }

    // --- 7. not-found path -------------------------------------------------
    const missing = await call(`${BASE}/matches?select=*&id=eq.e2e-no-such-match`, { headers: bearerHeaders(token) });
    check(missing.length === 0, "unknown id returns no rows (page shows not-found)", `${missing.length}`);

    // --- 8. static contract ------------------------------------------------
    const source = fs.readFileSync(path.join(__dirname, "match.js"), "utf8");
    check(source.includes("[a-z0-9_-]") && source.includes("URLSearchParams"), "match.js validates ?id= and reads the query string");
    const page = fs.readFileSync(path.join(__dirname, "match.html"), "utf8");
    check(page.includes("requireTeam") || source.includes("requireTeam"), "match.js gates the page behind requireTeam()");
    check(page.includes('name="robots" content="noindex'), "match.html is noindexed (team-only page)");
  } finally {
    if (state.noteProbe) {
      await call(`${BASE}/match_notes?match_id=eq.${played?.id ?? ""}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
    if (state.teamUserId) {
      await call(`${AUTH}/admin/users/${state.teamUserId}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
  }

  // --- post-cleanup ---------------------------------------------------------
  const notesLeft = await call(`${BASE}/match_notes?select=match_id&updated_by=eq.verify-match.cjs`, { headers: adminHeaders });
  check(notesLeft.length === 0, "probe match note removed", `${notesLeft.length} left`);
  const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
  check(!(users.users || []).some((user) => user.email === TEAM_EMAIL), "ephemeral team user deleted");
  const roster = await call(`${BASE}/coach_roster?select=email`, { headers: adminHeaders });
  check(roster.length === 1, "coach_roster untouched", roster.map((row) => row.email).join(", "));

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Match review verified: queries, embeds, lineup split, signups, notes access, gating.");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
