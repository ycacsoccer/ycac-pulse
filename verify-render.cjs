// Render check for the public index (verify-render.cjs):
//   node verify-render.cjs
// Executes app.js render() under a minimal DOM stub against live ANON data —
// catches runtime/template errors static checks can't see (an earlier version
// of this test caught the match.match_id bug in the old attendance table).
// Asserts: every querySelector id exists in index.html, both trend charts plot
// one chip per match, scorer bars render, the KPI strips carry three rate
// tiles (wave 21 dropped the attendance tile) and render() never touches an
// attendance element — the tables are gone from page and renderer.
const fs = require("fs");
global.window = globalThis;
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
global.location = { search: "", href: "http://localhost/", pathname: "/", hash: "" };

const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const emptyStateHtml = (html.match(/<template id="empty-state">([\s\S]*?)<\/template>/) || [])[1] || "";
const unknownIds = [];
const elements = new Map();
const makeEl = (id) => ({ id, innerHTML: id === "empty-state" ? emptyStateHtml : "", textContent: "", value: "", hidden: false, title: "", style: {},
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

global.YCACI18n = require("./i18n.js");
require("./config.js");
require("./data.js");
global.YCACData = window.YCACData;
global.YCACStats = require("./stats.js");
require("./charts.js");
global.YCACCharts = window.YCACCharts;
require("./app.js");

const el = (id) => elements.get(id) || { innerHTML: "", textContent: "" };
const failures = [];
const check = (ok, label, detail = "") => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

(async () => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && !el("squad-chips").innerHTML) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check(unknownIds.length === 0, "every querySelector id exists in index.html", unknownIds.join(", ") || "none unknown");

  const trend = el("perf-tml-trend").innerHTML;
  const tmlChips = (trend.match(/tv-chip tv-chip-/g) || []).length;
  check(trend.includes("<svg") && tmlChips === 4, "TML trend chart rendered", `${tmlChips} chips`);
  const fndTrend = el("perf-friendly-trend").innerHTML;
  const fndChips = (fndTrend.match(/tv-chip tv-chip-/g) || []).length;
  check(fndTrend.includes("<svg") && fndChips === 7, "friendly trend chart rendered", `${fndChips} chips`);
  check(el("perf-tml-scorers").innerHTML.includes("goal-bar"), "TML scorer bars rendered");
  check(el("perf-friendly-scorers").innerHTML.includes("goal-bar"), "friendly scorer bars rendered");
  // wave 17 → 21: the KPI rate strip under each trend chart — three tiles per
  // panel (goals/game, conceded/game, win rate); the attendance tile is gone.
  const kpiTiles = (markup) => (markup.match(/class="kpi"/g) || []).length;
  const tmlKpi = el("perf-tml-kpi").innerHTML, fndKpi = el("perf-friendly-kpi").innerHTML;
  const firstKpiValue = (tmlKpi.match(/<strong>([^<]*)</) || [])[1] || "?";
  check(kpiTiles(tmlKpi) === 3 && kpiTiles(fndKpi) === 3 && /[\d]/.test(firstKpiValue),
    "KPI strips render 3 rate tiles per panel", `TML goals/game ${firstKpiValue}`);
  check(!/attendance/i.test(tmlKpi + fndKpi), "no attendance tile in either KPI strip");

  // squad status (revamp 15): visible only once the injuries table is live
  const injuryCards = (el("injury-list").innerHTML.match(/injury-card/g) || []).length;
  check(!el("squad-status").hidden && injuryCards === 4, "squad status: current injuries rendered", `${injuryCards} cards`);

  // wave 21 — attendance is no longer presented: the page ships no attendance
  // containers and render() never queries one (a stray reference would land in
  // unknownIds above, but assert the intent explicitly too).
  check(!htmlIds.has("tml-attendance") && !htmlIds.has("fnd-attendance") && !htmlIds.has("attendance-search"),
    "index.html ships no attendance containers");
  check(!elements.has("tml-attendance") && !elements.has("fnd-attendance") && !elements.has("attendance-search"),
    "render() never queries an attendance element");
  const anyAttendance = [...elements.values()].some((node) => /attendance/i.test(node.innerHTML || ""));
  check(!anyAttendance, "no rendered output mentions attendance");

  check(el("fixtures").innerHTML.includes("fixture") || el("fixtures").innerHTML.includes("No data"), "fixtures render (or empty state)", `${(el("fixtures").innerHTML.match(/class="fixture"/g) || []).length} fixtures`);
  check(el("squad-chips").innerHTML.includes("squad-chip"), "squad chips render");
  check(el("tml-results").innerHTML.includes("match-score"), "TML results render");
  // wave 23 — unified segmented band: the record now lives on #season-record
  // (the twin tml-/friendly- scorelines are gone) and every lens cell is set.
  check(/\d+–\d+–\d+/.test(el("season-record").innerHTML), "season record set", el("season-record").innerHTML.slice(0, 20));
  const bandCells = ["season-goals-for", "season-goals-against", "season-goal-diff", "season-win-rate", "season-clean-sheets"];
  check(bandCells.every((id) => el(id).textContent !== "-"), "stat band cells populated (GD + win rate included)");
  // wave 23 — matchday-first hero: a last-result card (or the static fallback).
  const matchday = el("matchday").innerHTML;
  check(matchday.includes("md-card") || matchday.includes("hero-note"), "matchday hero renders", `${(matchday.match(/md-card/g) || []).length} cards`);

  // wave 24 — data modules: the form guide + streak repaint with the lens;
  // assists, the goal-timing histogram and the trajectory curve render (or the
  // empty state while live goals still lack minute/assist data).
  const formPills = (el("season-form").innerHTML.match(/form-pill/g) || []).length;
  check(formPills > 0 && formPills <= 5, "form guide renders at most five pills", `${formPills} pills`);
  check(el("season-streak").textContent.trim().length > 0, "streak readout set", el("season-streak").textContent);
  const tmlAssists = el("perf-tml-assists").innerHTML;
  check(tmlAssists.includes("assist-bar") || tmlAssists.includes("No data"), "TML assists render (or empty state)", `${(tmlAssists.match(/assist-bar/g) || []).length} bars`);
  const fndAssists = el("perf-friendly-assists").innerHTML;
  check(fndAssists.includes("assist-bar") || fndAssists.includes("No data"), "friendly assists render (or empty state)", `${(fndAssists.match(/assist-bar/g) || []).length} bars`);
  const timing = el("timing-chart").innerHTML;
  check(timing.includes("<svg") || timing.includes("No data"), "goal-timing histogram renders (or empty state)");
  const trajectory = el("trajectory-chart").innerHTML;
  check(trajectory.includes("<svg") && /class="tr-val"[^>]*>[+-]?\d+</.test(trajectory), "season trajectory rendered with a signed end value");

  console.log("");
  if (failures.length) { console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`); process.exit(1); }
  console.log("Index rendered end-to-end: charts, KPIs, results, squad — no attendance tables.");
})().catch((error) => { console.error("ERROR", error); process.exit(1); });
