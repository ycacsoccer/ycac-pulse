// Data-path check for the coach dashboard (coach.html + coach.js):
//   node verify-coach.cjs
// Signs in an ephemeral rostered coach, runs the dashboard's exact queries (same
// strings coach.js uses), feeds them through stats.js, and asserts the inputs
// behind the board, the coverage matrix and the flags. User is deleted after.
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
const secret = env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = config.publishable;

const adminHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const anonHeaders = { apikey: publishable, Authorization: `Bearer ${publishable}`, "Content-Type": "application/json" };
const bearerHeaders = (token) => ({ apikey: publishable, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

const E2E_EMAIL = "e2e-dashboard@ycac-pulse.test";
const E2E_PASSWORD = "E2e-Verify-2026!";

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

// The exact query strings coach.js runs.
const QUERIES = {
  players: "select=id,display_name,shirt_number,primary_position,secondary_positions,photo_path,active&order=display_name",
  matches: "select=*&order=date",
  appearances: "select=*",
  goals: "select=*",
  signups: "select=match_id,player_id,status",
  coach_notes: "select=player_id,squad_status",
};

async function main() {
  if (!secret || !publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying coach dashboard data path against ${env.SUPABASE_URL}\n`);
  const coachSource = fs.readFileSync(path.join(__dirname, "coach.js"), "utf8");
  const coachPage = fs.readFileSync(path.join(__dirname, "coach.html"), "utf8");
  check(coachSource.includes("YCACAuth.requireCoach") && !coachSource.includes("YCACAuth.requireTeam"),
    "coach dashboard uses the single coach gate");
  check(coachPage.includes('id="tactics-map"') && coachPage.includes('src="tactics.js"')
    && coachSource.includes("YCACTactics.coverage") && coachSource.includes("secondary_positions"),
  "coach dashboard wires the formation coverage heat map");

  let userId = null;
  try {
    // --- 0. pending-fixture probe (all real matches may have results) ------
    // Keeps the fixtures checks meaningful regardless of schedule state;
    // removed in finally.
    await call(`${BASE}/matches?id=eq.e2e-fixture`, { method: "DELETE", headers: adminHeaders });
    await call(`${BASE}/matches`, { method: "POST", headers: adminHeaders, body: [{ id: "e2e-fixture", date: "2099-12-01", competition: "Friendly Match", opponent: "E2E Probe FC" }] });

    // slate: remove leftovers, then create + roster the ephemeral coach
    await call(`${BASE}/coach_roster?email=eq.${E2E_EMAIL}`, { method: "DELETE", headers: adminHeaders });
    const existing = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
    for (const user of existing.users || []) {
      if (user.email === E2E_EMAIL) await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
    }
    const created = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: E2E_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    userId = created.id;
    check(Boolean(userId), "ephemeral coach user created", E2E_EMAIL);
    await call(`${BASE}/coach_roster`, { method: "POST", headers: adminHeaders, body: [{ email: E2E_EMAIL }] });
    check(true, "ephemeral user added to coach_roster");

    const grant = await call(`${AUTH}/token?grant_type=password`, { method: "POST", headers: anonHeaders, body: { email: E2E_EMAIL, password: E2E_PASSWORD } });
    const token = grant.access_token;
    check(Boolean(token), "password grant (coach session)");

    // --- 1. RLS: this page needs the session --------------------------------
    const anonCount = await fetch(`${BASE}/signups?select=match_id`, { headers: { ...anonHeaders, Prefer: "count=exact" } })
      .then((res) => Number(res.headers.get("content-range")?.split("/")[1] ?? "NaN"));
    check(anonCount === 0, "anon sees 0 signups (page must gate on login)", `anon ${anonCount}`);

    // --- 2. the dashboard's queries, with the session ------------------------
    const [players, matches, appearances, goals, signups, coachNotes] = await Promise.all(
      Object.entries(QUERIES).map(([table, query]) => call(`${BASE}/${table}?${query}`, { headers: bearerHeaders(token) })),
    );
    check(Array.isArray(players) && players.length >= 30, "players query", `${players.length} rows`);
    check(Array.isArray(matches) && matches.length >= 10, "matches query", `${matches.length} rows`);
    check(Array.isArray(appearances) && appearances.length >= 100, "appearances query", `${appearances.length} rows`);
    check(Array.isArray(goals) && goals.length >= 30, "goals query", `${goals.length} rows`);
    check(Array.isArray(signups) && signups.length > 0, "signups query (private table)", `${signups.length} rows`);
    check(Array.isArray(coachNotes), "coach_notes query runs for coach session", `${coachNotes.length} rows`);

    // --- 3. the engine, exactly as coach.js calls it -------------------------
    const overrides = Object.fromEntries(coachNotes.filter((note) => note.squad_status).map((note) => [note.player_id, { squad_status: note.squad_status }]));
    const season = YCACStats.computeSeason({ players, matches, appearances, goals, signups, statusOverrides: overrides });

    const entries = season.players;
    check(entries.length >= 30, "board entries (active players)", `${entries.length}`);
    const bucketTotal = season.buckets.tml.length + season.buckets.friendly.length + season.buckets.other.length;
    check(bucketTotal === season.buckets.all.length, "competition buckets partition played matches", `${season.buckets.tml.length} TML + ${season.buckets.friendly.length} friendly + ${season.buckets.other.length} other = ${season.buckets.all.length}`);
    check(season.fixtures.length >= 1, "next fixture exists", season.fixtures[0] ? `${season.fixtures[0].date} vs ${season.fixtures[0].opponent}` : "none");
    check(season.fixtures.every((match, index, list) => index === 0 || list[index - 1].date <= match.date), "fixtures sorted by date");

    const tierTotal = YCACStats.TIER_ORDER.reduce((sum, tier) => sum + season.tiers[tier].length, 0);
    check(tierTotal === entries.length, "tier board covers every entry", `${tierTotal} of ${entries.length}`);
    // participation invariants — catches a players/appearances key mismatch that
    // would silently put every player in "inactive" with 0 apps
    check(season.counts.used >= 25, "players with real participation", `${season.counts.used} of ${entries.length} used`);
    const activeTiers = season.tiers.core.length + season.tiers.rotation.length + season.tiers.depth.length;
    check(activeTiers === season.counts.used, "every used player is core/rotation/depth, never inactive", `${activeTiers} vs ${season.counts.used} used`);
    check(season.tiers.inactive.length === entries.length - season.counts.used, "inactive = zero appearances", `${season.tiers.inactive.length}`);
    check(entries.some((entry) => entry.competitions.all.starts > 0) && entries.some((entry) => entry.competitions.all.goals > 0),
      "starts and goals recorded per player", `${entries.reduce((sum, entry) => sum + entry.competitions.all.goals, 0)} goals across the board`);
    const coverage = YCACStats.coverage(entries);
    const coverageTotal = Object.values(coverage).reduce((sum, groups) => sum + Object.values(groups).reduce((inner, list) => inner + list.length, 0), 0);
    check(coverageTotal === entries.length, "coverage matrix covers every entry", `${coverageTotal} of ${entries.length}`);

    const lensOk = ["tml", "friendly", "all"].every((lens) => entries.every((entry) => {
      const stats = entry.competitions[lens];
      return stats && typeof stats.played === "number" && typeof stats.starts === "number"
        && "appearance_pct" in stats && typeof stats.goals === "number" && typeof stats.assists === "number";
    }));
    check(lensOk, "every entry has board stats for all three lenses");
    check(entries.every((entry) => entry.reliability === null || Number.isInteger(entry.reliability)), "reliability computed for the board");

    const rankedOrder = YCACStats.ranked(entries);
    const tierMonotonic = rankedOrder.every((entry, index, list) => index === 0 || YCACStats.TIER_ORDER.indexOf(list[index - 1].tier) <= YCACStats.TIER_ORDER.indexOf(entry.tier));
    check(rankedOrder.length === entries.length && tierMonotonic, "board ranking groups by tier");

    // --- 4. flag inputs (print — these change with the data) -----------------
    const byNumber = new Map();
    entries.forEach((entry) => {
      if (entry.shirt_number == null) return;
      byNumber.set(entry.shirt_number, [...(byNumber.get(entry.shirt_number) || []), entry.display_name]);
    });
    const duplicates = [...byNumber.values()].filter((names) => names.length > 1);
    const missingPhotos = entries.filter((entry) => !entry.photo_path);
    const friendlyOnly = entries.filter((entry) => entry.competitions.friendly.played > 0 && entry.competitions.tml.played === 0);
    const playedIds = new Set(season.buckets.all.map((match) => match.match_id ?? match.id));
    const appearanceKeys = new Set(appearances.map((app) => `${app.match_id}:${app.player_id}`));
    const declinedButPlayed = signups.filter((signup) => ["declined", "unavailable"].includes(String(signup.status).toLowerCase())
      && playedIds.has(signup.match_id) && appearanceKeys.has(`${signup.match_id}:${signup.player_id}`));
    console.log(`     flags: ${missingPhotos.length} missing photos · ${duplicates.length} duplicate numbers · ${friendlyOnly.length} friendly-only · ${declinedButPlayed.length} declined-but-played`);
    const nextSignups = signups.filter((signup) => signup.match_id === season.fixtures[0]?.id);
    console.log(`     next fixture signups: ${nextSignups.length} responded`);
    check(Number.isInteger(duplicates.length + missingPhotos.length + friendlyOnly.length + declinedButPlayed.length), "flag inputs computed without errors");
  } finally {
    await call(`${BASE}/matches?id=eq.e2e-fixture`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    await call(`${BASE}/coach_roster?email=eq.${E2E_EMAIL}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    if (userId) await call(`${AUTH}/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders }).catch(() => null);
    const leftover = users?.users?.some((user) => user.email === E2E_EMAIL);
    check(!leftover, "ephemeral user deleted");
  }

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Coach dashboard data path verified: queries, RLS, engine inputs, flags.");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
