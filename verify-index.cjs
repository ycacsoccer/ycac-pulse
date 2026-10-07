// Data-path check for the public season dashboard (index.html + app.js):
//   node verify-index.cjs
// All checks are ANON — the index must render from public tables alone.
// Asserts: the four stats tables read anon with row-shape the renderer needs
// (photo_path on every player, nullable scores), the TML/friendly/fixture split,
// join integrity for appearance & top-scorer maps, the stable-squad chips via
// stats.js (same engine as the coach dashboard, derived tiers only), and the
// static contract: gviz gone, results/fxtures link to match.html, photos on
// squad cards, friendly results folded — and no attendance tables anywhere
// (wave 21 removed them).
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
  check(players.every((player) => "photo_path" in player && "active" in player), "photo_path + active fields present (card photos)",
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

  // --- 4. join integrity (appearance maps + top scorers) -------------------
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
  check(app.includes("YCACStats.computeSeason") && app.includes("YCACStats.ranked"), "index shares the stats.js engine with the coach dashboard");
  check(app.includes("match.html?id="), "results & fixtures link to match review");
  check(app.includes("player.html?id=") && app.includes("photoCell"), "squad chips carry photos + profile links");
  check(app.includes("squad-chips") && page.includes('id="squad-chips"'), "stable-squad container wired app.js → index.html");
  check(page.includes('<script src="stats.js">'), "index.html loads stats.js");
  check(page.includes('<script src="charts.js">') && app.includes("YCACCharts.trendSVG"), "performance trend charts wired (charts.js → app.js)");
  check(["perf-tml-trend", "perf-friendly-trend", "perf-tml-scorers", "perf-friendly-scorers", "perf-tml-kpi", "perf-friendly-kpi"].every((id) => app.includes(`#${id}`) && page.includes(`id="${id}"`)),
    "performance containers wired app.js → index.html");
  // wave 21 — attendance is no longer a purpose of the site: the tables, the
  // search box and the per-game KPI are gone from page AND renderer.
  check(!page.includes('id="tml-attendance"') && !page.includes('id="fnd-attendance"') && !app.includes("#tml-attendance"),
    "attendance tables removed from index.html + app.js");
  check(!page.includes("attendance-panel") && !page.includes('id="attendance-search"') && !app.includes("attendance-search"),
    "attendance panel + search box gone");
  check(!app.includes("kpiAttendancePerGame") && !page.includes('id="attendance-head"') && !app.includes("#season-timeline"),
    "attendance KPI tile gone; old combined table + viz timeline stay removed");
  // wave 23 — presentation rework wiring: matchday-first hero, one segmented
  // stat band (the twin scorelines are gone), and the bento board.
  check(app.includes("#matchday") && page.includes('id="matchday"') && page.includes('class="matchday"'),
    "matchday hero wired app.js → index.html");
  check(page.includes('id="season-record"') && app.includes("#season-record") && page.includes('data-seg="tml"') && app.includes("paintBand"),
    "segmented stat band wired (3 lenses → 6 cells, GD + win rate included)");
  check(!page.includes('id="tml-record"') && !app.includes("setStats("), "twin tml-/friendly- scorelines + setStats() removed");
  check(page.includes('class="bento"') && ["b-fixtures", "b-results", "b-perf-tml", "b-perf-friendly", "b-squad", "b-status", "b-trajectory", "b-timing", "b-age"].every((cls) => page.includes(cls)),
    "bento board: fixtures, results, performance ×2, trajectory, timing, age, squad, injuries");
  // wave 24 — data modules wired: form guide + streak in the band, assists
  // beside the scorers, goal timing + trajectory in two new bento cells.
  check(page.includes('id="season-form"') && app.includes("#season-form") && page.includes('id="season-streak"') && app.includes("#season-streak") && app.includes("streakWon"),
    "form guide + streak wired app.js → index.html");
  check(["perf-tml-assists", "perf-friendly-assists", "trajectory-chart", "timing-chart"].every((id) => app.includes(`#${id}`) && page.includes(`id="${id}"`)),
    "assist / goal-timing / trajectory containers wired app.js → index.html");
  // wave 25 — standings: the shipped data module feeds a single on-page table,
  // the club row is flagged once, and the nav anchors to it.
  check(page.includes('<script src="standings.js">') && app.includes("#standings-body") && page.includes('id="standings-body"'),
    "standings panel wired (standings.js → app.js → index.html)");
  const standings = require("./standings.js");
  check(standings.rows.filter((row) => row.us).length === 1, "exactly one club row flagged us",
    standings.rows.find((row) => row.us)?.team || "none");
  check(page.includes('href="#standings"'), "nav Standings link jumps to the on-page table");
  check((page.match(/<table/g) || []).length === 1 && page.includes('class="standings-table"'),
    "the only <table> in index.html is the standings", `${(page.match(/<table/g) || []).length} table`);
  // wave 26 — public shell: four useful links, no private-tool clutter.
  const publicNav = page.match(/<nav aria-label="Primary navigation">([\s\S]*?)<\/nav>/)?.[1] || "";
  check((publicNav.match(/<a /g) || []).length === 4 && publicNav.includes('href="#fixtures-section"')
    && publicNav.includes('href="#standings"') && publicNav.includes('href="players.html"') && publicNav.includes("band.us"),
  "public nav reduced to Fixtures / Standings / Players / Schedule", `${(publicNav.match(/<a /g) || []).length} links`);
  check(!publicNav.includes("team.html") && !publicNav.includes("squad-picker.html"),
    "private Team + Squad Picker links removed from the public nav");
  // wave 28 — age groups are a public, colour-coded squad view.
  check(page.includes('<script src="agebands.js">') && page.includes('id="age-distribution"')
    && app.includes("YCACAgeBands.distribution") && app.includes("#age-distribution"),
  "public age distribution wired (agebands.js → app.js → index.html)");
  // wave 23 — the two cascade leaks stay fixed: coach .fixture-card child rules
  // scoped away from the public navy card, and the match-page gold score scoped.
  const styles = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  check(!/^\.(fixture-date|fixture-meta|fixture-time|fixture-actions|fixture-opponent) \{/m.test(styles),
    "coach .fixture-card child rules stay scoped (no navy-on-navy public fixture text)");
  const scoped = ".match-hero .match-score {";
  check(styles.includes(scoped) && styles.lastIndexOf(".match-score {") === styles.lastIndexOf(scoped) + ".match-hero ".length,
    "gold .match-score rule stays scoped under .match-hero (no gold scores on index)");

  // charts.js renders the real TML timeline: one chip per match, correct W/D/L mix
  const charts = require("./charts.js");
  const trendMarkup = charts.trendSVG(tmlPlayed, { labels: { result: { W: "W", D: "D", L: "L" } } });
  const count = (letter) => (trendMarkup.match(new RegExp(`tv-chip-${letter}`, "g")) || []).length;
  const wins = tmlPlayed.filter((match) => Number(match.ycac_goals) > Number(match.opponent_goals)).length;
  const draws = tmlPlayed.filter((match) => Number(match.ycac_goals) === Number(match.opponent_goals)).length;
  const losses = tmlPlayed.length - wins - draws;
  check(count("w") === wins && count("d") === draws && count("l") === losses,
    "trend chart: one result chip per TML match", `${wins}W/${draws}D/${losses}L of ${tmlPlayed.length}`);
  const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  check(tmlPlayed.every((match) => trendMarkup.includes(escapeHtml(String(match.opponent).slice(0, 8)))), "trend chart: every TML opponent labelled");
  check(charts.stepFor(12) === 4 && charts.stepFor(3) === 1 && charts.stepFor(120) === 20, "trend chart gridline steps stay readable");
  // wave 17: diverging geometry — goals for rise from the zero line, goals
  // against hang below it, both measured on the same symmetric scale
  const bars = [...trendMarkup.matchAll(/tv-bar tv-(for|against)" x="[-\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)]
    .map((match) => ({ kind: match[1], y: Number(match[2]), h: Number(match[3]) }));
  const geometryOk = bars.length === tmlPlayed.length * 2 && bars.every((bar) => (bar.kind === "for"
    ? Math.abs(bar.y + bar.h - charts.ZERO) < 1e-6
    : Math.abs(bar.y - charts.ZERO) < 1e-6));
  check(geometryOk && bars.some((bar) => bar.kind === "for" && bar.h > 0) && bars.some((bar) => bar.kind === "against" && bar.h > 0),
    "trend chart: goals for rise above the zero line, goals against hang below", `${bars.length} bars`);
  const tmlKpis = charts.kpis(tmlPlayed);
  const gfTotal = tmlPlayed.reduce((total, match) => total + Number(match.ycac_goals), 0);
  check(tmlKpis.gf === gfTotal && tmlKpis.gfPerGame === gfTotal / tmlPlayed.length
    && tmlKpis.winPct === Math.round((wins / tmlPlayed.length) * 100) && tmlKpis.draws === draws && tmlKpis.losses === losses,
    "kpi rates: goals per game + win rate + record", `${Number(tmlKpis.gfPerGame.toFixed(2))}/game · ${tmlKpis.winPct}% win`);
  check(page.includes('<details class="results-fold"') && page.includes('id="friendly-results"'), "friendly results fold behind <details>");
  // wave 24: the trajectory curve ends on the season's cumulative goal
  // difference, and the timing histogram counts exactly the datable goals.
  const finals = [...tmlPlayed, ...friendlyPlayed];
  const trajectoryMarkup = charts.trajectorySVG(finals);
  const endValue = (trajectoryMarkup.match(/class="tr-val"[^>]*>([+-]?\d+)</) || [])[1] || "";
  const totalGd = finals.reduce((total, match) => total + Number(match.ycac_goals) - Number(match.opponent_goals), 0);
  const expectedEnd = totalGd > 0 ? `+${totalGd}` : `${totalGd}`;
  check(Boolean(finals.length) && endValue === expectedEnd, "trajectory curve ends on cumulative goal difference",
    `${endValue} vs ${expectedEnd}`);
  const datable = goals.filter((goal) => charts.timingBucket(goal.minute) >= 0).length;
  const timingMarkup = charts.timingSVG(goals);
  const bucketed = (timingMarkup.match(/class="tm-count"[^>]*>(\d+)</g) || [])
    .reduce((total, tag) => total + Number(tag.match(/>(\d+)</)[1]), 0);
  check(timingMarkup.includes("<svg") === (datable > 0) && (!datable || bucketed === datable),
    "goal-timing histogram counts every datable goal exactly once",
    `${datable} of ${goals.length} goals carry a minute`);
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
