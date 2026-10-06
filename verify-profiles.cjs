// Data-path + storage check for the profile pages (players.html / player.html):
//   node verify-profiles.cjs
// Public queries run as anon; the photo-upload flow runs exactly like player.js
// does it (upload → PATCH players.photo_path → restore) with ephemeral users.
// Everything it creates is removed afterwards.
const fs = require("fs");
const path = require("path");
const YCACStats = require("./stats.js");

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
const STORAGE = `${env.SUPABASE_URL}/storage/v1`;
const secret = env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = config.publishable;

const adminHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const anonHeaders = { apikey: publishable, Authorization: `Bearer ${publishable}`, "Content-Type": "application/json" };
const bearerHeaders = (token) => ({ apikey: publishable, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

const COACH_EMAIL = "e2e-profile-coach@ycac-pulse.test";
const TEAM_EMAIL = "e2e-profile-team@ycac-pulse.test";
const E2E_PASSWORD = "E2e-Verify-2026!";
const PROBE_PATH = "e2e-profile-probe.png";
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const failures = [];
const check = (ok, label, detail = "") => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function call(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} → ${response.status}: ${text.slice(0, 200)}`);
  try { return text ? JSON.parse(text) : null; } catch (error) { return text; }
}

const signIn = (email) => call(`${AUTH}/token?grant_type=password`, { method: "POST", headers: anonHeaders, body: JSON.stringify({ email, password: E2E_PASSWORD }) });

function uploadForm() {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(PNG_BASE64, "base64")], { type: "image/png" }), "probe.png");
  return form;
}
const postObject = (token, headers = {}) => fetch(`${STORAGE}/object/player-photos/${PROBE_PATH}`, {
  method: "POST",
  headers: token ? { apikey: publishable, Authorization: `Bearer ${token}`, "x-upsert": "false", ...headers } : { apikey: publishable, Authorization: `Bearer ${publishable}`, "x-upsert": "false", ...headers },
  body: uploadForm(),
});

async function slate() {
  // remove leftovers from an interrupted run
  await fetch(`${STORAGE}/object/player-photos/${PROBE_PATH}`, { method: "DELETE", headers: { apikey: secret, Authorization: `Bearer ${secret}` } }).catch(() => {});
  const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders }).catch(() => null);
  for (const user of users?.users || []) {
    if (user.email === COACH_EMAIL || user.email === TEAM_EMAIL) {
      await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
  }
  await call(`${BASE}/coach_roster?email=in.("${COACH_EMAIL}","${TEAM_EMAIL}")`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
}

async function main() {
  if (!secret || !publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying profile pages against ${env.SUPABASE_URL}\n`);

  const state = { coachId: null, teamId: null, rosterAdded: false, photoPlayer: null, originalPhoto: undefined };

  try {
    await slate();

    // --- 1. public grid + detail queries (as players.js / player.js run) -----
    const players = await call(`${BASE}/players?select=*&order=display_name`, { headers: anonHeaders });
    const matches = await call(`${BASE}/matches?select=*&order=date`, { headers: anonHeaders });
    check(players.length >= 30 && matches.length >= 10, "public queries (players + matches)", `${players.length} players, ${matches.length} matches`);

    const allGoals = await call(`${BASE}/goals?select=*`, { headers: anonHeaders });
    const scorerCounts = new Map();
    allGoals.forEach((goal) => scorerCounts.set(goal.scorer_id, (scorerCounts.get(goal.scorer_id) || 0) + 1));
    const topScorerId = [...scorerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const player = players.find((row) => row.id === topScorerId);
    check(Boolean(player), "top scorer resolved for the detail page", `${player?.display_name} (${scorerCounts.get(topScorerId)} goals)`);

    const appRows = await call(`${BASE}/appearances?select=*,matches(date,opponent,competition,ycac_goals,opponent_goals)&player_id=eq.${player.id}`, { headers: anonHeaders });
    const goalRows = await call(`${BASE}/goals?select=*,matches(date,opponent,competition)&or=(scorer_id.eq.${player.id},assist_id.eq.${player.id})`, { headers: anonHeaders });
    check(appRows.length >= 5, "appearances query with embedded match", `${appRows.length} rows`);
    check(Boolean(appRows[0]?.matches?.date) && !Array.isArray(appRows[0].matches), "embedded match arrives as an object with date");
    check(goalRows.some((goal) => goal.scorer_id === player.id && goal.matches?.date), "goals or-filter (scorer OR assist) with embedded match", `${goalRows.length} rows`);
    // wave 19: the profile badges each goal row TML/FND from match.competition —
    // a goals query WITHOUT competition silently labels every goal "TML".
    check(goalRows.length > 0 && goalRows.every((goal) => Boolean(goal.matches?.competition)),
      "every goal row embeds match competition (profile TML/FND badge depends on it)",
      `${goalRows.filter((goal) => goal.matches?.competition).length} of ${goalRows.length} rows`);
    const compById = Object.fromEntries(matches.map((match) => [match.id, match.competition]));
    const scoredByComp = allGoals.reduce((acc, goal) => { const c = compById[goal.match_id] || ""; return /friendly/i.test(c) ? { ...acc, fnd: acc.fnd + 1 } : /tml/i.test(c) ? { ...acc, tml: acc.tml + 1 } : acc; }, { tml: 0, fnd: 0 });
    check(scoredByComp.tml > 0 && scoredByComp.fnd > 0, "season has goals in BOTH competitions (badge split is meaningful)",
      `${scoredByComp.tml} TML + ${scoredByComp.fnd} FND`);

    const finals = new Set(matches.filter((match) => match.ycac_goals != null && match.opponent_goals != null).map((match) => match.id));
    const entry = YCACStats.computeSeason({ players: [{ ...player, active: true }], matches, appearances: appRows, goals: goalRows }).players[0];
    const expectedApps = appRows.filter((row) => finals.has(row.match_id)).length;
    const expectedGoals = goalRows.filter((goal) => goal.scorer_id === player.id && finals.has(goal.match_id)).length;
    check(entry.competitions.all.played === expectedApps && expectedApps > 0, "profile stats: appearances counted", `${entry.competitions.all.played} of ${expectedApps}`);
    check(entry.competitions.all.goals === expectedGoals && expectedGoals > 0, "profile stats: goals counted", `${entry.competitions.all.goals} of ${expectedGoals}`);
    const split = entry.competitions.tml.played + entry.competitions.friendly.played + entry.competitions.other.played;
    check(split === entry.competitions.all.played, "TML/Friendly/All columns partition", `${entry.competitions.tml.played} TML + ${entry.competitions.friendly.played} FND = ${split}`);
    check(YCACStats.TIER_ORDER.includes(entry.tier) && (entry.reliability === null || Number.isInteger(entry.reliability)), "tier + reliability valid", `tier ${entry.tier}, reliability ${entry.reliability}`);
    check(["left", "right", "both", null].includes(player.preferred_foot), "preferred_foot value valid", String(player.preferred_foot));

    // --- 1b. position diagram (revamp 13) ------------------------------------
    const outfield = players.filter((row) => row.primary_position !== "GK");
    const keepers = players.filter((row) => row.primary_position === "GK");
    check(outfield.length > 0 && outfield.every((row) => Array.isArray(row.secondary_positions) && row.secondary_positions.length > 0),
      "every outfield player has capable positions", `${outfield.length} outfield players`);
    check(keepers.every((row) => (row.secondary_positions || []).length === 0), "keepers have no capable outfield positions", `${keepers.length} keepers`);
    const positionMap = require("./positionmap.js");
    check(players.every((row) => positionMap.known(row.primary_position)), "every primary position has diagram coordinates");
    const page = fs.readFileSync(path.join(__dirname, "player.html"), "utf8");
    check(page.includes('id="profile-positions"') && page.includes('src="positionmap.js"'), "player.html includes the diagram panel + positionmap.js");
    const sample = outfield[0];
    const markup = positionMap.svg(sample.primary_position, sample.secondary_positions);
    check(markup.includes("pm-best") && sample.secondary_positions.every((code) => markup.includes(`>${code.toUpperCase()}<`)),
      "diagram renders best + capable dots", `${sample.display_name}: ${sample.primary_position} + ${sample.secondary_positions.join(",")}`);
    const deduped = positionMap.svg("RB", ["RB", "LB"]);
    check((deduped.match(/>RB</g) || []).length === 1 && (deduped.match(/>LB</g) || []).length === 1,
      "best position excluded from capable dots");

    // --- 1c. player cards + performance timeline (wave 17) ---------------------
    const gridJs = fs.readFileSync(path.join(__dirname, "players.js"), "utf8");
    check(gridJs.includes("pc-quick") && gridJs.includes("appearance_pct") && gridJs.includes("buckets.tml"),
      "player cards carry TML + friendly appearance percentages");
    const profileJs = fs.readFileSync(path.join(__dirname, "player.js"), "utf8");
    check(page.includes('id="profile-timeline"') && profileJs.includes("statusAbsent") && profileJs.includes("timeline-entry"),
      "profile timeline wired (every final match, absences labelled)");
    check(profileJs.includes("profile-tiles") && profileJs.includes("kpiGoalsPerGame"),
      "profile hero stat tiles (apps, goals, goals/game, attendance)");

    // --- 1d. wave 18 — position sections + selection-group wording ------------
    const gridPage = fs.readFileSync(path.join(__dirname, "players.html"), "utf8");
    check(gridPage.includes('class="position-sections"') && gridPage.includes('data-i18n="filterTierNote"'),
      "players page: position sections + selection-group explainer");
    check(gridPage.includes('data-i18n="filterTier"') && !gridPage.includes(">Tier<") && !gridPage.includes("Tier filter"),
      "tier wording replaced on the player list");
    check(gridJs.includes("POSITION_SECTIONS") && gridJs.includes("position-section"),
      "grid broken down into position sections");

    // --- 2. photo upload is coach-only ---------------------------------------
    const anonUpload = await postObject(null);
    check(anonUpload.status >= 400, "anon photo upload denied", `status ${anonUpload.status}`);

    const coach = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ email: COACH_EMAIL, password: E2E_PASSWORD, email_confirm: true }) });
    state.coachId = coach.id;
    const team = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: JSON.stringify({ email: TEAM_EMAIL, password: E2E_PASSWORD, email_confirm: true }) });
    state.teamId = team.id;
    await call(`${BASE}/coach_roster`, { method: "POST", headers: adminHeaders, body: JSON.stringify([{ email: COACH_EMAIL }]) });
    state.rosterAdded = true;
    check(Boolean(state.coachId && state.teamId), "ephemeral coach + team users created");

    const teamGrant = await signIn(TEAM_EMAIL);
    const teamUpload = await postObject(teamGrant.access_token);
    check(teamUpload.status >= 400, "team session photo upload denied (read-only)", `status ${teamUpload.status}`);

    // --- 3. the coach flow, exactly like player.js ---------------------------
    const coachGrant = await signIn(COACH_EMAIL);
    const coachToken = coachGrant.access_token;
    const upload = await postObject(coachToken);
    check(upload.ok, "coach photo upload accepted", `status ${upload.status}`);
    const publicFile = await fetch(`${STORAGE}/object/public/player-photos/${PROBE_PATH}`);
    check(publicFile.ok && String(publicFile.headers.get("content-type") || "").includes("image"), "photo public URL serves the image", `${publicFile.status} ${publicFile.headers.get("content-type")}`);

    state.photoPlayer = player.id;
    const original = await call(`${BASE}/players?id=eq.${player.id}&select=photo_path`, { headers: adminHeaders });
    state.originalPhoto = original[0]?.photo_path ?? null;
    const patched = await call(`${BASE}/players?id=eq.${player.id}`, {
      method: "PATCH", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" }, body: JSON.stringify({ photo_path: PROBE_PATH }),
    });
    check(patched.length === 1 && patched[0].photo_path === PROBE_PATH, "coach writes players.photo_path", `${patched.length} row`);

    const del = await fetch(`${STORAGE}/object/player-photos/${PROBE_PATH}`, { method: "DELETE", headers: { apikey: publishable, Authorization: `Bearer ${coachToken}` } });
    check(del.ok, "coach deletes own photo object", `status ${del.status}`);
  } finally {
    // --- restore everything ---------------------------------------------------
    if (state.photoPlayer !== null && state.originalPhoto !== undefined) {
      await call(`${BASE}/players?id=eq.${state.photoPlayer}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ photo_path: state.originalPhoto }) }).catch(() => {});
    }
    await slate();
  }

  // CDN may keep serving the public URL after deletion — ask storage directly
  const listed = await call(`${STORAGE}/object/list/player-photos`, {
    method: "POST", headers: adminHeaders, body: JSON.stringify({ prefix: "e2e-profile-probe", limit: 10, offset: 0 }),
  });
  check(Array.isArray(listed) && listed.length === 0, "probe object removed", `${Array.isArray(listed) ? listed.length : "?"} object(s) left`);
  if (state.photoPlayer) {
    const restored = await call(`${BASE}/players?id=eq.${state.photoPlayer}&select=photo_path`, { headers: adminHeaders });
    check((restored[0]?.photo_path ?? null) === state.originalPhoto, "photo_path restored to original", String(restored[0]?.photo_path));
  }
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
  console.log("Profile pages verified: public queries, stats split, photo upload (coach-only).");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
