// Data-path check for the public season dashboard (index.html + app.js):
//   node verify-index.cjs
// All checks are ANON — the index must render from public tables alone.
// Asserts: the four stats tables read anon with row-shape the renderer needs
// (photo_path on every player, nullable scores), the TML/friendly/fixture split,
// join integrity for attendance & top-scorer maps, the stable-squad chips via
// stats.js (same engine as the coach dashboard, derived tiers only), and the
// static contract: gviz gone, results/fxtures link to match.html, photos in the
// attendance table, friendly results folded.
const fs = require("fs");
const path = require("path");

const readConfig = () => {
  const source = fs.readFileSync(path.join(__dirname, "config.js"), "utf8");
  const grab = (key) => source.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] || "";
  return { url: grab("supabaseUrl"), publishable: grab("supabaseAnonKey") };
};

const config = readConfig();
const BASE = `${config.url}/rest/v1`;
const anonHeaders = { apikey: config.publishable, Authorization: `Bearer ${config.publishable}`, "Content-Type": "application/json" };
const YCACStats = require("./stats.js");

const failures = [];
const check = (ok, label, detail = "") => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function call(url) {
  const response = await fetch(url, { headers: anonHeaders });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
  if (!response.ok) throw new Error(`GET ${url} → ${response.status}: ${text.slice(0, 200)}`);
  return data;
}

async function main() {
  if (!config.url || !config.publishable) throw new Error("missing credentials (config.js)");
  console.log(`Verifying public index against ${config.url}\n`);

  // --- 1. anon reads the four stats tables --------------------------------
  const [players, matches, appearances, goals] = await Promise.all([
    call(`${BASE}/players?select=*&order=display_name`),
    call(`${BASE}/matches?select=*&order=date`),
    call(`${BASE}/appearances?select=*`),
    call(`${BASE}/goals?select=*`),
  ]);
  check(players.length >= 30, "anon reads players", `${players.length} rows`);
  check(matches.length >= 10, "anon reads matches", `${matches.length} rows`);
  check(appearances.length >= 100, "anon reads appearances", `${appearances.length} rows`);
  check(goals.length >= 30, "anon reads goals", `${goals.length} rows`);

  // --- 2. row shape the renderer depends on -------------------------------
  check(players.every((player) => player.id && player.display_name), "every player has id + display_name",
    `${players.filter((p) => p.id && p.display_name).length}/${players.length}`);
  check(players.every((player) => "photo_path" in player && "active" in player), "photo_path + active fields present (attendance photos)",
    `${players.filter((p) => p.photo_path).length} with photos`);
  check(matches.every((match) => match.id && match.date && match.competition && "ycac_goals" in match && "opponent_goals" in match),
    "every match has id/date/competition + nullable scores",
    `${matches.filter((m) => YCACStats.isFinal(m)).length} final, ${matches.filter((m) => !YCACStats.isFinal(m)).length} pending`);

  // --- 3. TML-first split --------------------------------------------------
  const tmlPlayed = matches.filter((m) => m.competition === "TML Division 3" && YCACStats.isFinal(m));
  const friendlyPlayed = matches.filter((m) => m.competition === "Friendly Match" && YCACStats.isFinal(m));
  const fixtures = matches.filter((m) => !YCACStats.isFinal(m));
  check(tmlPlayed.length >= 1, "TML results section has entries", `${tmlPlayed.length} played`);
  check(friendlyPlayed.length >= 1, "folded friendly section has entries", `${friendlyPlayed.length} played`);
  // isFinal must classify every match as played or pending (a regression that
  // called everything final/pending would break the split silently otherwise)
  check(tmlPlayed.length + friendlyPlayed.length + fixtures.length === matches.length,
    "TML + friendly + fixtures partition every match",
    `${tmlPlayed.length + friendlyPlayed.length} played, ${fixtures.length} pending`);

  // --- 4. join integrity (attendance maps + top scorers) -------------------
  const playerIds = new Set(players.map((p) => p.id));
  const finalIds = new Set(matches.filter((m) => YCACStats.isFinal(m)).map((m) => m.id));
  const appOrphans = appearances.filter((a) => !playerIds.has(a.player_id) || !finalIds.has(a.match_id));
  check(appOrphans.length === 0, "every appearance joins a player + final match",
    `${appearances.length - appOrphans.length}/${appearances.length}`);
  const goalOrphans = goals.filter((g) => !playerIds.has(g.scorer_id) || !finalIds.has(g.match_id));
  check(goalOrphans.length === 0, "every goal joins a scorer + final match", `${goals.length - goalOrphans.length}/${goals.length}`);

  // --- 5. stable-squad chips (stats.js, derived tiers only) ----------------
  const season = YCACStats.computeSeason({ players, matches, appearances, goals });
  const active = players.filter((p) => p.active !== false);
  const partition = ["core", "rotation", "depth", "inactive"].flatMap((tier) => season.tiers[tier]);
  check(partition.length === active.length, "tiers partition every active player",
    `${active.length} active · core ${season.tiers.core.length} · rotation ${season.tiers.rotation.length}`);
  const core = YCACStats.ranked(season.tiers.core);
  check(core.length >= 1, "stable-squad chips render (core tier present)", `${core.length} chips`);
  check(core.every((entry) => entry.id && entry.display_name), "every chip has a link target + name",
    core.slice(0, 3).map((entry) => entry.display_name).join(", "));
  check(core.every((entry) => YCACStats.TIER_ORDER.includes(entry.tier)), "chip entries carry a valid tier");

  // --- 6. static contract --------------------------------------------------
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const page = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const i18n = fs.readFileSync(path.join(__dirname, "i18n.js"), "utf8");
  check(!app.includes("docs.google.com") && !app.includes("getSheet"), "gviz sheet loader is gone from app.js");
  check(app.includes("YCACStats.computeSeason") && app.includes("YCACStats.positionGroup"), "index shares the stats.js engine with the coach dashboard");
  check(app.includes("match.html?id="), "results & fixtures link to match review");
  check(app.includes("player.html?id=") && app.includes("attendance-player") && app.includes("photoCell"), "attendance rows carry photos + profile links");
  check(app.includes("squad-chips") && page.includes('id="squad-chips"'), "stable-squad container wired app.js → index.html");
  check(page.includes('<script src="stats.js">'), "index.html loads stats.js");
  check(page.includes('<details class="results-fold"') && page.includes('id="friendly-results"'), "friendly results fold behind <details>");
  check((i18n.match(/indexSquadTitle:/g) || []).length === 3, "indexSquadTitle translated in all 3 languages",
    `${(i18n.match(/indexSquadTitle:/g) || []).length}/3`);

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Public index verified: anon reads, TML-first split, joins, squad chips, static contract.");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
