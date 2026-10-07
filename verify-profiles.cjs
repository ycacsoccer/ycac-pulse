// Data-path + storage check for the profile pages (players.html / player.html):
//   node verify-profiles.cjs
// Public queries run as anon; the photo-upload flow AND the wave-20 position
// editor run exactly like the page does them (coach PATCH → verify → restore)
// with ephemeral users. Everything it creates is removed afterwards.
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

  const state = { coachId: null, teamId: null, rosterAdded: false, photoPlayer: null, originalPhoto: undefined, posPlayer: null, originalPositions: null, agePlayer: null, originalAge: undefined };

  try {
    await slate();

    // --- 1. public grid + detail queries (as players.js / player.js run) -----
    const players = await call(`${BASE}/players?select=*&order=display_name`, { headers: anonHeaders });
    const matches = await call(`${BASE}/matches?select=*&order=date`, { headers: anonHeaders });
    check(players.length >= 30 && matches.length >= 10, "public queries (players + matches)", `${players.length} players, ${matches.length} matches`);
    const activePlayers = players.filter((row) => row.active !== false);
    check(activePlayers.every((row) => ["17-20", "20s", "30s", "40s", "50s"].includes(row.age_band)),
      "every active player has a valid public age band", `${activePlayers.filter((row) => row.age_band).length}/${activePlayers.length}`);

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

    // --- 1c. player cards + performance timeline (wave 26 competition split) --
    const gridJs = fs.readFileSync(path.join(__dirname, "players.js"), "utf8");
    check(gridJs.includes("pc-split") && gridJs.includes("competitions.tml") && gridJs.includes("competitions.friendly") && gridJs.includes("appearance_pct"),
      "player cards split TML/Friendly apps, appearance rate, goals and assists");
    const profileJs = fs.readFileSync(path.join(__dirname, "player.js"), "utf8");
    check(page.includes('id="profile-timeline"') && profileJs.includes("statusAbsent") && profileJs.includes("timeline-entry"),
      "profile timeline wired (every final match, absences labelled)");
    check(profileJs.includes("profile-competition-grid") && profileJs.includes('competitionCard("tml"')
      && profileJs.includes('competitionCard("friendly"') && profileJs.includes("statAppearanceRate"),
    "profile hero splits TML/Friendly and detailed stats include appearance rate");
    const ageMigration = fs.readFileSync(path.join(__dirname, "supabase", "migrations", "0003_player_age_band.sql"), "utf8");
    check(ageMigration.includes("add column if not exists age_band") && ageMigration.includes("players_age_band_check")
      && profileJs.includes('id="age-band-select"') && profileJs.includes('{ age_band: selected || null }'),
    "coach-editable age band is constrained by migration and wired on the player page");

    // --- 1d. wave 18 — position sections + selection-group wording ------------
    const gridPage = fs.readFileSync(path.join(__dirname, "players.html"), "utf8");
    check(gridPage.includes('class="position-sections"') && gridPage.includes('data-i18n="filterTierNote"'),
      "players page: position sections + selection-group explainer");
    check(gridPage.includes('data-i18n="filterTier"') && !gridPage.includes(">Tier<") && !gridPage.includes("Tier filter"),
      "tier wording replaced on the player list");
    check(gridJs.includes("POSITION_SECTIONS") && gridJs.includes("position-section"),
      "grid broken down into position sections");

    // --- 1e. wave 20 — coach position editor (tap-a-slot on the pitch) -------
    const editMarkup = positionMap.editable(sample.primary_position, sample.secondary_positions);
    const slotCount = (editMarkup.match(/data-pos="/g) || []).length;
    check(slotCount === Object.keys(positionMap.COORDS).length,
      "editable diagram renders every position slot", `${slotCount} slots`);
    check(!editMarkup.includes("aria-hidden") && editMarkup.includes('role="button"') && editMarkup.includes('tabindex="0"'),
      "editable slots are focusable buttons (not aria-hidden)");
    check(editMarkup.includes('pm-slot pm-best"') && editMarkup.includes('pm-slot pm-capable"') && editMarkup.includes('pm-slot pm-empty"'),
      "editable diagram marks best / capable / empty slot states");
    check(profileJs.includes("YCACPositionMap.editable") && profileJs.includes('data-pos-action="edit"') && profileJs.includes("state.isCoach"),
      "player.js: coach-gated pitch editor wired to #profile-positions");
    check(profileJs.includes('update("players"') && profileJs.includes("secondary_positions") && profileJs.includes("rows.length !== 1"),
      "player.js saves best + can-play positions with a 0-row guard");
    check(profileJs.includes('addEventListener("keydown"') && profileJs.includes('closest("[data-pos]")'),
      "pitch slots are keyboard-operable (keydown → pickSlot)");

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

    // --- 4. wave 20 — position editor writes (best + can-play) ---------------
    state.posPlayer = player.id;
    const posOriginal = await call(`${BASE}/players?id=eq.${player.id}&select=primary_position,secondary_positions`, { headers: adminHeaders });
    state.originalPositions = { primary_position: posOriginal[0].primary_position, secondary_positions: posOriginal[0].secondary_positions };

    // anon + team may fire the SAME PATCH player.js runs — both must be no-ops
    const attemptPositions = async (token, body) => {
      const response = await fetch(`${BASE}/players?id=eq.${player.id}`, {
        method: "PATCH",
        headers: { ...(token ? bearerHeaders(token) : anonHeaders), Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let rows = null;
      try { rows = text ? JSON.parse(text) : null; } catch (error) { rows = null; }
      return { status: response.status, rows };
    };
    const anonAttempt = await attemptPositions(null, { primary_position: "GK" });
    check(anonAttempt.status >= 400 || (Array.isArray(anonAttempt.rows) && anonAttempt.rows.length === 0),
      "anon position edit denied", `status ${anonAttempt.status}`);
    const teamAttempt = await attemptPositions(teamGrant.access_token, { primary_position: "GK" });
    check(teamAttempt.status >= 400 || (Array.isArray(teamAttempt.rows) && teamAttempt.rows.length === 0),
      "team session position edit denied (read-only)", `status ${teamAttempt.status}`);
    const afterAttempts = await call(`${BASE}/players?id=eq.${player.id}&select=primary_position`, { headers: adminHeaders });
    check(afterAttempts[0].primary_position === state.originalPositions.primary_position,
      "position unchanged after anon/team attempts", String(afterAttempts[0].primary_position));

    // the coach flow, exactly like player.js savePositions()
    const probeBest = Object.keys(positionMap.COORDS).find((code) => code !== state.originalPositions.primary_position) || "ST";
    const probeCapable = ["LW", "RW"].filter((code) => code !== probeBest);
    const posPatched = await call(`${BASE}/players?id=eq.${player.id}`, {
      method: "PATCH", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" },
      body: JSON.stringify({ primary_position: probeBest, secondary_positions: probeCapable }),
    });
    check(posPatched.length === 1 && posPatched[0].primary_position === probeBest
      && Array.isArray(posPatched[0].secondary_positions) && posPatched[0].secondary_positions.join(",") === probeCapable.join(","),
      "coach writes best + can-play positions", `${posPatched.length} row`);

    // --- 5. wave 27 — age-band editor writes (coach only + constrained) ------
    state.agePlayer = player.id;
    const ageOriginal = await call(`${BASE}/players?id=eq.${player.id}&select=age_band`, { headers: adminHeaders });
    state.originalAge = ageOriginal[0]?.age_band ?? null;
    const ageProbe = state.originalAge === "30s" ? "40s" : "30s";
    const anonAge = await attemptPositions(null, { age_band: ageProbe });
    check(anonAge.status >= 400 || (Array.isArray(anonAge.rows) && anonAge.rows.length === 0), "anon age-band edit denied", `status ${anonAge.status}`);
    const teamAge = await attemptPositions(teamGrant.access_token, { age_band: ageProbe });
    check(teamAge.status >= 400 || (Array.isArray(teamAge.rows) && teamAge.rows.length === 0), "team age-band edit denied (read-only)", `status ${teamAge.status}`);
    const agePatched = await call(`${BASE}/players?id=eq.${player.id}`, {
      method: "PATCH", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" }, body: JSON.stringify({ age_band: ageProbe }),
    });
    check(agePatched.length === 1 && agePatched[0].age_band === ageProbe, "coach writes players.age_band", ageProbe);
    const invalidAge = await fetch(`${BASE}/players?id=eq.${player.id}`, {
      method: "PATCH", headers: { ...bearerHeaders(coachToken), Prefer: "return=representation" }, body: JSON.stringify({ age_band: "60s" }),
    });
    check(invalidAge.status >= 400, "database rejects an unsupported age band", `status ${invalidAge.status}`);
  } finally {
    // --- restore everything ---------------------------------------------------
    if (state.photoPlayer !== null && state.originalPhoto !== undefined) {
      await call(`${BASE}/players?id=eq.${state.photoPlayer}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ photo_path: state.originalPhoto }) }).catch(() => {});
    }
    if (state.posPlayer !== null && state.originalPositions) {
      await call(`${BASE}/players?id=eq.${state.posPlayer}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify(state.originalPositions) }).catch(() => {});
    }
    if (state.agePlayer !== null && state.originalAge !== undefined) {
      await call(`${BASE}/players?id=eq.${state.agePlayer}`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ age_band: state.originalAge }) }).catch(() => {});
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
  if (state.posPlayer && state.originalPositions) {
    const posRestored = await call(`${BASE}/players?id=eq.${state.posPlayer}&select=primary_position,secondary_positions`, { headers: adminHeaders });
    check(posRestored[0].primary_position === state.originalPositions.primary_position
      && JSON.stringify(posRestored[0].secondary_positions) === JSON.stringify(state.originalPositions.secondary_positions),
      "positions restored to original", String(posRestored[0].primary_position));
  }
  if (state.agePlayer && state.originalAge !== undefined) {
    const ageRestored = await call(`${BASE}/players?id=eq.${state.agePlayer}&select=age_band`, { headers: adminHeaders });
    check((ageRestored[0]?.age_band ?? null) === state.originalAge, "age_band restored to original", String(ageRestored[0]?.age_band ?? null));
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
  console.log("Profile pages verified: public queries, stats split, photo + position + age-band writes (coach-only).");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
