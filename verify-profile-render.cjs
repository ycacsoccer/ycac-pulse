// Render check for the player pages (verify-profile-render.cjs):
//   node verify-profile-render.cjs
// Executes players.js (grid) and player.js (profile) under a minimal DOM stub
// against live ANON data. Asserts the wave-17 cards carry TML + friendly
// appearance percentages, the profile shows hero stat tiles, and the timeline
// has a row for EVERY final match — absences labelled (the picked player is
// the one who has missed the most matches while still having played).
const fs = require("fs");
global.window = globalThis;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const YCACStats = require("./stats.js");
const configSource = fs.readFileSync(__dirname + "/config.js", "utf8");
const grab = (key) => configSource.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] || "";
const BASE = `${grab("supabaseUrl")}/rest/v1`;
const anonHeaders = { apikey: grab("supabaseAnonKey"), Authorization: `Bearer ${grab("supabaseAnonKey")}`, "Content-Type": "application/json" };

const failures = [];
const check = (ok, label, detail = "") => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

const get = async (path) => {
  const response = await fetch(`${BASE}/${path}`, { headers: anonHeaders });
  const text = await response.text();
  if (!response.ok) throw new Error(`GET ${path} → ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text || "[]");
};

(async () => {
  // --- 1. pick the test player: most absences, but at least one appearance ---
  const [players, matches, appearances, goals] = await Promise.all([
    get("players?select=*&order=display_name"),
    get("matches?select=*&order=date"),
    get("appearances?select=*"),
    get("goals?select=*"),
  ]);
  const finals = matches.filter((match) => YCACStats.isFinal(match));
  const appsByPlayer = new Map();
  const goalsByPlayer = new Map();
  appearances.forEach((row) => appsByPlayer.set(row.player_id, (appsByPlayer.get(row.player_id) || 0) + 1));
  goals.forEach((row) => goalsByPlayer.set(row.scorer_id, (goalsByPlayer.get(row.scorer_id) || 0) + 1));
  const pick = players.filter((player) => player.active !== false)
    .map((player) => ({
      id: player.id, name: player.display_name,
      played: appsByPlayer.get(player.id) || 0,
      abs: finals.length - (appsByPlayer.get(player.id) || 0),
      goals: goalsByPlayer.get(player.id) || 0,
    }))
    .filter((player) => player.played > 0 && player.abs > 0)
    .sort((a, b) => (b.abs - a.abs) || (b.goals - a.goals) || a.name.localeCompare(b.name))[0];
  if (!pick) throw new Error("no player with appearances + absences found");
  console.log(`Verifying player pages against ${BASE} (picked: ${pick.name} — ${pick.played} played, ${pick.abs} absent)\n`);
  global.location = { search: `?id=${pick.id}`, href: "http://localhost/", pathname: "/", hash: "" };

  // --- 2. minimal DOM stub (same approach as verify-render.cjs) --------------
  const pages = ["player.html", "players.html"].map((file) => fs.readFileSync(__dirname + `/${file}`, "utf8"));
  const htmlIds = new Set(pages.flatMap((page) => [...page.matchAll(/id="([^"]+)"/g)].map((match) => match[1])));
  const unknownIds = [];
  const elements = new Map();
  const makeEl = (id) => ({ id, innerHTML: "", textContent: "", value: "", hidden: false, title: "", style: {}, dataset: {},
    classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute: () => null, addEventListener() {} });
  const bySelector = (selector) => {
    if (!selector.startsWith("#")) return makeEl(selector);
    const id = selector.slice(1);
    if (!elements.has(id)) {
      elements.set(id, makeEl(id));
      if (!htmlIds.has(id)) unknownIds.push(id);
    }
    return elements.get(id);
  };
  global.document = {
    querySelector: bySelector,
    querySelectorAll: () => [],
    getElementById: (id) => bySelector(`#${id}`),
    documentElement: { lang: "en", dataset: {} },
    addEventListener() {},
    title: "",
  };
  global.YCACAuth = { session: null, isCoach: async () => false };

  global.YCACI18n = require("./i18n.js");
  require("./config.js");
  require("./data.js");
  global.YCACData = window.YCACData;
  global.YCACStats = YCACStats;
  require("./positionmap.js");
  global.YCACPositionMap = window.YCACPositionMap;
  require("./players.js"); // grid
  require("./player.js");  // profile

  const el = (id) => elements.get(id) || { innerHTML: "", textContent: "" };
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && (!el("players-grid").innerHTML || !el("profile-timeline").innerHTML)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check(unknownIds.length === 0, "every getElementById id exists in players.html/player.html", unknownIds.join(", ") || "none unknown");

  // --- 3. player grid: cards with TML + friendly percentages ---------------
  const grid = el("players-grid").innerHTML;
  const cardCount = (grid.match(/class="player-card"/g) || []).length;
  check(cardCount >= 30, "player grid renders cards", `${cardCount} cards`);
  const tmlCells = (grid.match(/class="pcq tml"/g) || []).length;
  const fndCells = (grid.match(/class="pcq fnd"/g) || []).length;
  check(tmlCells === cardCount && fndCells === cardCount && cardCount > 0,
    "every card carries TML + friendly percentage cells", `${tmlCells} TML / ${fndCells} FND of ${cardCount}`);
  check(/<strong>\d+%<\/strong>/.test(grid) && grid.includes("pc-tot"),
    "cards show numeric appearance percentages + season totals",
    (grid.match(/<strong>\d+%<\/strong>/) || ["no pct"])[0]);

  // --- 3b. wave 18: grouped into position sections, selection wording --------
  const sections = (grid.match(/position-section-head/g) || []).length;
  check(sections >= 4 && grid.includes("Goalkeepers") && grid.includes("Attackers"),
    "player grid grouped into position sections", `${sections} sections`);
  check(grid.includes("Plays often") && !grid.includes("🟢 Core") && !grid.includes("First-choice"),
    "card badges use attendance-frequency wording (no tier/ability language)");
  const tierChips = el("tier-filters").innerHTML;
  check(tierChips.includes("Plays often") && tierChips.includes("Not yet played") && tierChips.includes("Plays occasionally"),
    "selection-group filter chips named by appearance frequency", tierChips.replace(/<[^>]+>/g, " ").trim().slice(0, 70));

  // --- 4. profile: hero tiles, stats rows, full timeline --------------------
  const hero = el("profile-hero").innerHTML;
  const tiles = (hero.match(/class="ptile"/g) || []).length;
  check(tiles === 4 && hero.includes("Goals / game") && hero.includes(`pt-of">/${finals.length}<`) && /\d+%/.test(hero),
    "hero stat tiles: apps/goals, goals per game, attendance", `${tiles} tiles`);

  const stats = el("profile-stats").innerHTML;
  check(stats.includes("Attendance") && stats.includes("Goals / game"),
    "stats table: attendance + goals-per-game rows");

  const timeline = el("profile-timeline").innerHTML;
  const rows = (timeline.match(/class="timeline-entry/g) || []).length;
  check(rows === finals.length, "timeline shows every final match", `${rows}/${finals.length} rows`);
  const absentRows = timeline.split('class="timeline-entry').filter((chunk) => chunk.includes(" absent")).length;
  check(absentRows === pick.abs, "absences render as labelled rows", `${absentRows} absent · ${pick.abs} expected`);
  check(timeline.includes("⚪ Absent"), "absent status is explicitly labelled");
  check(timeline.includes("🟢 Starter") || timeline.includes("🔵 Substitute"), "played rows show starter/sub status");
  check((timeline.match(/timeline-group-head/g) || []).length >= 2, "TML + friendly group heads",
    `${(timeline.match(/timeline-group-head/g) || []).length} heads`);
  check((timeline.match(/timeline-score/g) || []).length === finals.length, "every timeline row carries the score");
  check(timeline.includes('href="match.html?id='), "timeline rows link to match review");
  check(el("profile-goals").innerHTML.length > 0, "goals panel renders (rows or empty state)");

  // --- 5. wave 19: goal rows must be BADGED by the match's competition ------
  // (the goals query used to omit `competition`, so every friendly goal read TML)
  const compOf = new Map(finals.map((match) => [match.id, match.competition]));
  const scorer = players.filter((player) => player.active !== false)
    .map((player) => ({
      id: player.id, name: player.display_name,
      tml: goals.filter((g) => g.scorer_id === player.id && /tml/i.test(compOf.get(g.match_id) || "")).length,
      fnd: goals.filter((g) => g.scorer_id === player.id && /friendly/i.test(compOf.get(g.match_id) || "")).length,
    }))
    .find((player) => player.tml > 0 && player.fnd > 0);
  if (scorer) {
    delete require.cache[require.resolve("./player.js")];
    global.location = { search: `?id=${scorer.id}`, href: "http://localhost/", pathname: "/", hash: "" };
    el("profile-goals").innerHTML = "";
    require("./player.js");
    const scoreDeadline = Date.now() + 15000;
    while (Date.now() < scoreDeadline && !el("profile-goals").innerHTML) await new Promise((r) => setTimeout(r, 100));
    const goalRows = el("profile-goals").innerHTML;
    const tmlBadges = (goalRows.match(/h-comp tml">TML/g) || []).length;
    const fndBadges = (goalRows.match(/h-comp friendly">FND/g) || []).length;
    check(tmlBadges === scorer.tml && fndBadges === scorer.fnd,
      `goal badges follow the match competition (${scorer.name})`,
      `${tmlBadges} TML / ${fndBadges} FND vs ${scorer.tml} / ${scorer.fnd} expected`);
    // guard the root cause: the goals query must embed competition, otherwise
    // compClass() can never see "Friendly Match" and defaults every row to TML.
    const playerSrc = fs.readFileSync(__dirname + "/player.js", "utf8");
    const goalsQuery = playerSrc.match(/select\("goals",[^)]*\)/)?.[0] || "";
    check(/matches\(date,opponent,competition\)/.test(goalsQuery),
      "player.js goals query embeds match competition", goalsQuery.slice(0, 90));
  } else {
    check(false, "no scorer has goals in both competitions to badge-check");
  }

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Player pages rendered end-to-end: cards, hero tiles, stats rows, full timeline.");
})().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
