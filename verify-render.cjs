// Render check for the public index (verify-render.cjs):
//   node verify-render.cjs
// Executes app.js render() under a minimal DOM stub against live ANON data —
// catches runtime/template errors static checks can't see (this test found the
// match.match_id bug that made the deployed attendance table show only dashes).
// Asserts: every querySelector id exists in index.html, both trend charts plot
// one chip per match, scorer bars render, both attendance tables carry real
// appearance markers and sort TML attendance descending.
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
  while (Date.now() < deadline && !el("tml-attendance").innerHTML) {
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
  // wave 17: the KPI rate strip under each trend chart (4 tiles per panel)
  const kpiTiles = (markup) => (markup.match(/class="kpi"/g) || []).length;
  const tmlKpi = el("perf-tml-kpi").innerHTML, fndKpi = el("perf-friendly-kpi").innerHTML;
  const firstKpiValue = (tmlKpi.match(/<strong>([^<]*)</) || [])[1] || "?";
  check(kpiTiles(tmlKpi) === 4 && kpiTiles(fndKpi) === 4 && /[\d]/.test(firstKpiValue),
    "KPI strips render 4 rate tiles per panel", `TML goals/game ${firstKpiValue}`);

  // squad status (revamp 15): visible only once the injuries table is live
  const injuryCards = (el("injury-list").innerHTML.match(/injury-card/g) || []).length;
  check(!el("squad-status").hidden && injuryCards === 4, "squad status: current injuries rendered", `${injuryCards} cards`);

  const tmlRows = (el("tml-attendance").innerHTML.match(/<tr>/g) || []).length;
  const fndRows = (el("fnd-attendance").innerHTML.match(/<tr>/g) || []).length;
  check(tmlRows >= 30, "TML attendance table rows", `${tmlRows} rows`);
  check(fndRows >= 30, "friendly attendance table rows", `${fndRows} rows`);
  const tmlHead = el("tml-attendance-head").innerHTML;
  check((tmlHead.match(/match-column/g) || []).length === 4, "TML head has 4 TML match columns", `${(tmlHead.match(/match-column/g) || []).length}`);
  check((tmlHead.match(/friendly-match/g) || []).length === 0, "TML head has no friendly columns");
  const fndHead = el("fnd-attendance-head").innerHTML;
  check((fndHead.match(/match-column/g) || []).length === 7, "friendly head has 7 friendly match columns", `${(fndHead.match(/match-column/g) || []).length}`);

  const emojiCount = (el("tml-attendance").innerHTML.match(/🟢|🔵/g) || []).length;
  const fndEmojiCount = (el("fnd-attendance").innerHTML.match(/🟢|🔵/g) || []).length;
  check(emojiCount >= 40 && fndEmojiCount >= 80, "attendance cells show real appearances (not all dashes)", `${emojiCount} TML + ${fndEmojiCount} FND markers`);
  const firstRow = el("tml-attendance").innerHTML.split("<tr>")[1] || "";
  const firstPct = Number(((firstRow.match(/(\d+)%/) || [])[1] || "0"));
  const lastPct = Number(((el("tml-attendance").innerHTML.match(/(\d+)%/g) || ["0"]).pop() || "0").replace("%", ""));
  check(firstPct === 100 && firstPct >= lastPct, "TML table sorted by TML attendance desc", `${firstPct}% → ${lastPct}%`);
  check(el("tml-attendance").innerHTML.includes("attendance-player"), "TML rows link to profiles with photos");

  check(el("fixtures").innerHTML.includes("fixture") || el("fixtures").innerHTML.includes("No data"), "fixtures render (or empty state)", `${(el("fixtures").innerHTML.match(/class="fixture"/g) || []).length} fixtures`);
  check(el("squad-chips").innerHTML.includes("squad-chip"), "squad chips render");
  check(el("tml-results").innerHTML.includes("match-score"), "TML results render");
  check(/\d+–\d+–\d+/.test(el("tml-record").innerHTML), "TML record set", el("tml-record").innerHTML.slice(0, 20));

  console.log("");
  if (failures.length) { console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`); process.exit(1); }
  console.log("Index rendered end-to-end: charts, attendance split, results, squad.");
})().catch((error) => { console.error("ERROR", error); process.exit(1); });
