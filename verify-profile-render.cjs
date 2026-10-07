// Render check for the player pages (verify-profile-render.cjs):
//   node verify-profile-render.cjs
// Executes players.js (grid) and player.js (profile) under a minimal DOM stub
// against live ANON data. Asserts wave-26 cards + hero split TML/Friendly
// apps, appearance rate, goals and assists; the timeline
// has a row for EVERY final match — absences labelled (the picked player is
// the one who has missed the most matches while still having played) — and
// (wave 20) drives the coach position editor: Edit → tap pitch slots →
// mode switch → save (stubbed, no DB write) → cancel.
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
  // listeners are RECORDED (not no-ops) so section 6 can dispatch real clicks
  // at the delegated handlers player.js attaches to #profile-positions.
  const makeEl = (id) => ({ id, innerHTML: "", textContent: "", value: "", hidden: false, title: "", style: {}, dataset: {}, listeners: {},
    classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, getAttribute: () => null,
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); } });
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
  require("./agebands.js");
  global.YCACAgeBands = window.YCACAgeBands;
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

  // --- 3. player grid: wave-26 competition split ----------------------------
  const grid = el("players-grid").innerHTML;
  const cardCount = (grid.match(/class="player-card"/g) || []).length;
  check(cardCount >= 30, "player grid renders cards", `${cardCount} cards`);
  const splits = (grid.match(/class="pc-split"/g) || []).length;
  check(splits === cardCount * 2 && (grid.match(/comp-chip tml/g) || []).length === cardCount
    && (grid.match(/comp-chip friendly/g) || []).length === cardCount,
  "every card splits TML + Friendly", `${splits} rows across ${cardCount} cards`);
  check(grid.includes("Appearance rate") && /\d+%/.test(grid) && grid.includes(" G · ") && grid.includes(" A</span>"),
    "card rows carry apps, appearance rate, goals and assists");
  check((grid.match(/class="age-badge /g) || []).length === cardCount,
    "every active player card has a colour-coded age badge", `${cardCount} badges`);

  // --- 3b. wave 18: grouped into position sections, selection wording --------
  const sections = (grid.match(/position-section-head/g) || []).length;
  check(sections >= 4 && grid.includes("Goalkeepers") && grid.includes("Attackers"),
    "player grid grouped into position sections", `${sections} sections`);
  check(grid.includes("Plays often") && !grid.includes("🟢 Core") && !grid.includes("First-choice"),
    "card badges use attendance-frequency wording (no tier/ability language)");
  const tierChips = el("tier-filters").innerHTML;
  check(tierChips.includes("Plays often") && tierChips.includes("Not yet played") && tierChips.includes("Plays occasionally"),
    "selection-group filter chips named by appearance frequency", tierChips.replace(/<[^>]+>/g, " ").trim().slice(0, 70));

  // --- 4. profile: competition summaries, stats rows, full timeline --------
  const hero = el("profile-hero").innerHTML;
  const summaries = (hero.match(/class="profile-competition /g) || []).length;
  check(summaries === 2 && hero.includes("TML Division 3") && hero.includes("Friendlies")
    && hero.includes("Appearance rate") && hero.includes("Goals") && hero.includes("Assists"),
  "hero splits TML + Friendly apps/rate/goals/assists", `${summaries} summaries`);

  // wave 20: visitors see the diagram only — no pitch-tap editor controls
  check(!el("profile-positions").innerHTML.includes("data-pos-action") && !el("profile-positions").innerHTML.includes("data-pos-mode"),
    "public profile: diagram without editor controls");

  const stats = el("profile-stats").innerHTML;
  check(stats.includes("Goals / game") && stats.includes("Appearance rate") && stats.includes(">TML<") && stats.includes(">Friendly<") && stats.includes(">All<"),
    "stats table: TML/Friendly/All with appearance rate + goals per game");

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

  // --- 6. wave 20: coach position editor (tap a slot → draft → save) --------
  const posMap = require("./positionmap.js");
  delete require.cache[require.resolve("./player.js")];
  global.YCACAuth = { session: { access_token: "e2e-stub" }, isCoach: async () => true, ensureFresh: async () => null };
  // wipe listeners recorded by the earlier (public) instances so only the
  // coach instance below reacts to the dispatches
  (elements.get("profile-positions")).listeners = {};
  el("profile-positions").innerHTML = "";
  require("./player.js");
  const editDeadline = Date.now() + 15000;
  while (Date.now() < editDeadline && !el("profile-positions").innerHTML.includes('data-pos-action="edit"')) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const posPanel = () => el("profile-positions").innerHTML;
  check(posPanel().includes('data-pos-action="edit"'), "coach profile shows the Edit positions control");
  check(!posPanel().includes("data-pos-mode"), "coach view mode has no editor until Edit is tapped");

  const firePos = (type, event) => ((elements.get("profile-positions").listeners || {})[type] || []).forEach((fn) => fn(event));
  const tapPos = (attrs) => firePos("click", { target: { closest: (selector) => {
    const name = selector.replace(/[[\]]/g, "");
    return attrs[name] !== undefined ? { getAttribute: () => attrs[name] } : null;
  } } });

  tapPos({ "data-pos-action": "edit" });
  const slotsOpen = (posPanel().match(/data-pos="/g) || []).length;
  check(slotsOpen === 17 && posPanel().includes("pm-empty"),
    "editor renders all 17 pitch slots with open ones", `${slotsOpen} slots`);
  check(posPanel().includes('data-pos-mode="best" aria-pressed="true"')
    && posPanel().includes('data-pos-action="save"') && posPanel().includes('data-pos-action="cancel"'),
    "editor has mode toggle + save/cancel");
  check(posPanel().includes("Tap a slot on the pitch to set the best position."),
    "best-mode hint shown (EN)");

  const editingId = new URLSearchParams(global.location.search).get("id") || "";
  const editingPlayer = players.find((row) => row.id === editingId) || {};
  const originalBest = String(editingPlayer.primary_position || "").toUpperCase();
  const bestPick = Object.keys(posMap.COORDS).find((code) => code !== originalBest);
  tapPos({ "data-pos": bestPick });
  check(posPanel().includes(`pm-best" data-pos="${bestPick}"`) && posPanel().includes(`<strong>${bestPick}</strong>`),
    `tapping a slot sets the BEST position (${bestPick})`);

  tapPos({ "data-pos-mode": "capable" });
  check(posPanel().includes('data-pos-mode="capable" aria-pressed="true"')
    && posPanel().includes("Tap a slot to add or remove a can-play position."),
    "mode toggle switches to CAN-PLAY (hint + aria-pressed)");

  const capPool = Object.keys(posMap.COORDS)
    .filter((code) => code !== bestPick && !(editingPlayer.secondary_positions || []).includes(code));
  check(capPool.length >= 2, "two free slots available for the can-play test", `${capPool.length} free`);
  const [capPick, keyPick] = capPool;
  tapPos({ "data-pos": capPick });
  check(posPanel().includes(`pm-capable" data-pos="${capPick}"`),
    `tapping toggles a CAN-PLAY slot (${capPick})`);

  // keyboard: Enter on a <g role="button"> slot does the same as a tap
  firePos("keydown", { key: "Enter", preventDefault() {}, target: { closest: (selector) => (
    selector === "[data-pos]" ? { getAttribute: () => keyPick } : null
  ) } });
  check(posPanel().includes(`pm-capable" data-pos="${keyPick}"`),
    `Enter on a slot toggles it too (${keyPick})`);

  // save — stub YCACData.update so NOTHING is written to the live database
  let savedPayload = null;
  const realUpdate = global.YCACData.update;
  global.YCACData.update = async (table, rows, query) => { savedPayload = { table, rows, query }; return [{ id: editingId, ...rows }]; };
  tapPos({ "data-pos-action": "save" });
  const saveDeadline = Date.now() + 5000;
  while (Date.now() < saveDeadline && !savedPayload) await new Promise((resolve) => setTimeout(resolve, 50));
  check(savedPayload && savedPayload.table === "players" && savedPayload.query === `id=eq.${editingId}`,
    "save PATCHes the players row", savedPayload ? savedPayload.query : "no payload");
  check(savedPayload && savedPayload.rows.primary_position === bestPick
    && Array.isArray(savedPayload.rows.secondary_positions)
    && savedPayload.rows.secondary_positions.includes(capPick)
    && !savedPayload.rows.secondary_positions.includes(bestPick),
    "payload: best set, can-play toggled in, best excluded from can-play");
  const confirmDeadline = Date.now() + 5000;
  while (Date.now() < confirmDeadline && !posPanel().includes("Positions updated.")) await new Promise((resolve) => setTimeout(resolve, 50));
  check(!posPanel().includes("data-pos-mode") && posPanel().includes("Positions updated.")
    && posPanel().includes('data-pos-action="edit"'),
    "editor closes with a saved confirmation");
  global.YCACData.update = realUpdate;

  // cancel — draft changes are discarded, the saved status clears
  tapPos({ "data-pos-action": "edit" });
  check(posPanel().includes("data-pos-mode"), "Edit reopens the editor");
  tapPos({ "data-pos-mode": "capable" });
  tapPos({ "data-pos": bestPick }); // the BEST slot can't double as can-play
  tapPos({ "data-pos-action": "cancel" });
  check(!posPanel().includes("data-pos-mode") && !posPanel().includes("Positions updated.")
    && posPanel().includes(`<strong>${bestPick}</strong>`),
    "Cancel discards the draft and clears the save status");

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Player pages rendered end-to-end: competition-split cards + hero, stats rows, full timeline.");
})().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
