// End-to-end check of the auth contract behind data.js + auth.js:
//   node verify-auth.cjs
// It drives the same GoTrue/PostgREST calls the browser code makes:
//   anon reads + writes open (wave 33) → password grant → is_coach() still
//   recognises the rostered coach → authenticated reads/writes → refresh grant
//   → logout, then removes everything it created.
// Ephemeral users only: e2e-team@ / e2e-coach@ (deleted afterwards, even on failure).
// The login itself stays optional: nothing gates on it, it only attributes
// writes (entered_by / updated_by).
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
  return { url: grab("supabaseUrl"), publishable: grab("supabaseAnonKey"), teamEmail: grab("teamEmail"), coachEmail: grab("coachEmail") };
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

const TEAM_EMAIL = "e2e-team@ycac-pulse.test";
const COACH_EMAIL = "e2e-coach@ycac-pulse.test";
const E2E_PASSWORD = "E2e-Verify-2026!";
const PROBE_SQUAD = "e2e-verify-probe";

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
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
  return { status: response.status, ok: response.ok, data, text };
}

async function count(table, headers) {
  const response = await fetch(`${BASE}/${table}?select=*`, { headers: { ...headers, Prefer: "count=exact" } });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return Number(response.headers.get("content-range")?.split("/")[1] ?? "NaN");
}

const signIn = (email, password) =>
  call(`${AUTH}/token?grant_type=password`, { method: "POST", headers: anonHeaders, body: { email, password } });

async function isCoach(token) {
  const result = await call(`${BASE}/rpc/is_coach`, { method: "POST", headers: bearerHeaders(token), body: {} });
  return { ok: result.ok, value: Boolean(result.data) };
}

async function cleanup({ rosterAdded, users }) {
  // Remove every trace of this run, whatever happened before.
  await call(`${BASE}/saved_squads?saved_squad_id=eq.${PROBE_SQUAD}`, { method: "DELETE", headers: adminHeaders });
  if (rosterAdded) await call(`${BASE}/coach_roster?email=eq.${COACH_EMAIL}`, { method: "DELETE", headers: adminHeaders });
  for (const user of users) {
    await call(`${AUTH}/admin/users/${user}`, { method: "DELETE", headers: adminHeaders });
  }
}

async function main() {
  if (!secret || !publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying auth contract against ${env.SUPABASE_URL}\n`);

  // --- static contract: one password-only coach login -----------------------
  const loginPage = fs.readFileSync(path.join(__dirname, "login.html"), "utf8");
  const loginSource = fs.readFileSync(path.join(__dirname, "login.js"), "utf8");
  check(!/type="email"/.test(loginPage), "login form asks for passwords only (no email fields)");
  check(!loginPage.includes('id="team-password"') && !loginPage.includes('id="team-form"') && loginPage.includes('id="coach-password"'),
    "one password field: coach only (no player/team login card)");
  check(!loginSource.includes("config.teamEmail") && loginSource.includes("config.coachEmail"),
    "login UI signs in only the configured coach account");
  check(Boolean(config.coachEmail), "config sets coachEmail", config.coachEmail);

  const state = { rosterAdded: false, users: [] };
  let rosterTotal = 0;

  try {
    // --- 0. clean slate (leftovers from an interrupted earlier run) ----------
    await cleanup({ rosterAdded: true, users: [] }); // probe rows + stray roster row
    const existing = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
    for (const user of existing.data?.users || []) {
      if (user.email === TEAM_EMAIL || user.email === COACH_EMAIL) {
        await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
      }
    }

    // --- baselines (ground truth with the secret key) ------------------------
    const signupsTotal = await count("signups", adminHeaders);
    const squadsTotal = await count("saved_squads", adminHeaders);
    rosterTotal = await count("coach_roster", adminHeaders);
    const [match] = await (await fetch(`${BASE}/matches?select=id&order=date&limit=1`, { headers: adminHeaders })).json();
    const [player] = await (await fetch(`${BASE}/players?select=id&order=id&limit=1`, { headers: adminHeaders })).json();
    check(signupsTotal > 0 && match?.id && player?.id, "baselines read with secret key", `${signupsTotal} signups, match ${match?.id}, player ${player?.id}`);

    // --- 1. ephemeral users + rostered coach --------------------------------
    const team = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: TEAM_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    check(team.ok && team.data?.id, "create ephemeral team user", TEAM_EMAIL);
    if (team.data?.id) state.users.push(team.data.id);
    const coach = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: COACH_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    check(coach.ok && coach.data?.id, "create ephemeral coach user", COACH_EMAIL);
    if (coach.data?.id) state.users.push(coach.data.id);
    const rosterRow = await call(`${BASE}/coach_roster`, { method: "POST", headers: adminHeaders, body: [{ email: COACH_EMAIL }] });
    state.rosterAdded = rosterRow.ok;
    check(rosterRow.ok, "roster the e2e coach (coach_roster insert)");

    // --- 2. anon: reads everything, writes freely (wave 33) ------------------
    check((await count("signups", anonHeaders)) === signupsTotal, "anon reads every signups row", `${signupsTotal}`);
    const anonWrite = await call(`${BASE}/saved_squads`, { method: "POST", headers: { ...anonHeaders, Prefer: "return=representation" }, body: [{ saved_squad_id: PROBE_SQUAD, match_id: match.id, formation: "4-2-3-1", player_id: player.id, selection_type: "starter", saved_by: "verify-auth.cjs" }] });
    check(anonWrite.ok && anonWrite.data?.[0]?.id !== undefined, "anon write accepted (public since wave 33)", `status ${anonWrite.status}`);
    check((await count("saved_squads", anonHeaders)) === squadsTotal + 1, "anon reads back its own row", `${squadsTotal} + 1 probe`);
    const anonDelete = await call(`${BASE}/saved_squads?saved_squad_id=eq.${PROBE_SQUAD}`, { method: "DELETE", headers: anonHeaders });
    check(anonDelete.ok, "anon deletes its own row", `status ${anonDelete.status}`);
    check((await count("saved_squads", adminHeaders)) === squadsTotal, "anon probe removed (no leftovers)", `${squadsTotal}`);

    // --- 3. team session: the password-grant flow auth.js runs ---------------
    const teamGrant = await signIn(TEAM_EMAIL, E2E_PASSWORD);
    check(teamGrant.ok && teamGrant.data?.access_token && teamGrant.data?.refresh_token, "team password grant", `status ${teamGrant.status}`);
    const teamToken = teamGrant.data?.access_token;
    if (!teamToken) throw new Error("cannot continue without a team token");

    check((await count("signups", bearerHeaders(teamToken))) === signupsTotal, "team session reads all signups", `${signupsTotal}`);
    const teamCoach = await isCoach(teamToken);
    check(teamCoach.ok && teamCoach.value === false, "team session is_coach() → false");

    const teamWrite = await call(`${BASE}/saved_squads`, { method: "POST", headers: { ...bearerHeaders(teamToken), Prefer: "return=representation" }, body: [{ saved_squad_id: PROBE_SQUAD, match_id: match.id, formation: "4-2-3-1", player_id: player.id, selection_type: "starter", saved_by: "verify-auth.cjs" }] });
    check(teamWrite.ok && teamWrite.data?.[0]?.id !== undefined, "authenticated (non-roster) write accepted — writes are open", `status ${teamWrite.status}`);
    const teamDelete = await call(`${BASE}/saved_squads?saved_squad_id=eq.${PROBE_SQUAD}`, { method: "DELETE", headers: bearerHeaders(teamToken) });
    check(teamDelete.ok, "authenticated session deletes its own row", `status ${teamDelete.status}`);

    // refresh grant (data.js → YCACAuth.ensureFresh)
    const refreshed = await call(`${AUTH}/token?grant_type=refresh_token`, { method: "POST", headers: anonHeaders, body: { refresh_token: teamGrant.data.refresh_token } });
    check(refreshed.ok && refreshed.data?.access_token, "refresh grant issues a new token", `status ${refreshed.status}`);
    if (refreshed.data?.access_token) {
      check((await count("signups", bearerHeaders(refreshed.data.access_token))) === signupsTotal, "refreshed token reads team data");
    }
    const logout = await call(`${AUTH}/logout`, { method: "POST", headers: bearerHeaders(teamToken) });
    check(logout.status === 204, "logout revokes the session", `status ${logout.status}`);

    // --- 4. coach session: writes go through ---------------------------------
    const coachGrant = await signIn(COACH_EMAIL, E2E_PASSWORD);
    check(coachGrant.ok && coachGrant.data?.access_token, "coach password grant", `status ${coachGrant.status}`);
    const coachToken = coachGrant.data?.access_token;
    if (!coachToken) throw new Error("cannot continue without a coach token");

    const coachCheck = await isCoach(coachToken);
    check(coachCheck.ok && coachCheck.value === true, "coach session is_coach() → true");
    check((await count("signups", bearerHeaders(coachToken))) === signupsTotal, "coach session reads all signups");

    const probeBody = [{ saved_squad_id: PROBE_SQUAD, match_id: match.id, formation: "4-2-3-1", player_id: player.id, selection_type: "starter", slot_order: 0, saved_by: "verify-auth.cjs", active: true }];
    const coachWrite = await call(`${BASE}/saved_squads`, { method: "POST", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" }, body: probeBody });
    const probeId = coachWrite.data?.[0]?.id;
    check(coachWrite.ok && probeId !== undefined, "coach session write accepted", `id ${probeId}`);

    check((await count("saved_squads", anonHeaders)) === squadsTotal + 1, "anon reads the coach's probe row too (public read)", `anon sees ${squadsTotal} + 1 probe`);

    if (probeId !== undefined) {
      const coachDelete = await call(`${BASE}/saved_squads?id=eq.${probeId}`, { method: "DELETE", headers: bearerHeaders(coachToken) });
      check(coachDelete.ok, "coach session deletes its own row", `status ${coachDelete.status}`);
    }
    check((await count("saved_squads", adminHeaders)) === squadsTotal, "probe row removed (no leftovers)", `${squadsTotal}`);
  } finally {
    await cleanup(state);
  }

  // --- 5. clean slate restored ------------------------------------------------
  const rosterLeft = await count("coach_roster", adminHeaders);
  check(rosterLeft === rosterTotal, "coach_roster restored", `${rosterLeft} row${rosterLeft === 1 ? "" : "s"}`);
  const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
  const leftovers = (users.data?.users || []).filter((u) => u.email === TEAM_EMAIL || u.email === COACH_EMAIL);
  check(leftovers.length === 0, "ephemeral users deleted");

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Auth contract verified: read + write open to anon; optional login still drives attribution + is_coach().");
}

main().catch(async (error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
