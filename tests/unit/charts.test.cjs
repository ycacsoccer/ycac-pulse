// Unit tests for charts.js — the hand-rolled SVG performance charts + KPI strip.
//   node --test tests/unit
// Geometry is asserted numerically (bars above/below the zero line) so a
// rendering regression shows up here instead of on the deployed dashboard.
const test = require("node:test");
const assert = require("node:assert/strict");
const charts = require("../../charts.js");

const matches = [
  { id: "t1", date: "2026-03-15", opponent: "Rovers & Sons", ycac_goals: 2, opponent_goals: 0 },
  { id: "t2", date: "2026-03-01", opponent: "Lakeside", ycac_goals: 1, opponent_goals: 1 },
  { id: "t3", date: "2026-04-05", opponent: "Hilltop", ycac_goals: 0, opponent_goals: 3 },
  { id: "fx", date: "2026-05-02", opponent: "Titans", ycac_goals: null, opponent_goals: null },
];

test("series: finals only, oldest first, reduced to chart rows", () => {
  const rows = charts.series(matches);
  assert.equal(rows.length, 3, "the fixture is excluded");
  assert.deepEqual(rows.map((row) => row.date), ["2026-03-01", "2026-03-15", "2026-04-05"], "sorted by date");
  assert.deepEqual(rows.map((row) => row.result), ["D", "W", "L"]);
  assert.equal(rows[1].gf, 2);
  assert.equal(rows[1].ga, 0);
  assert.equal(charts.series([]).length, 0);
});

test("resultOf: W / D / L from either numbers or strings", () => {
  assert.equal(charts.resultOf({ ycac_goals: 2, opponent_goals: 1 }), "W");
  assert.equal(charts.resultOf({ ycac_goals: "1", opponent_goals: "1" }), "D");
  assert.equal(charts.resultOf({ ycac_goals: 0, opponent_goals: 3 }), "L");
});

test("kpis: per-competition rate stats", () => {
  const stats = charts.kpis(matches.filter((match) => match.ycac_goals != null));
  assert.equal(stats.played, 3);
  assert.equal(stats.gf, 3);
  assert.equal(stats.ga, 4);
  assert.equal(stats.wins, 1);
  assert.equal(stats.draws, 1);
  assert.equal(stats.losses, 1);
  assert.equal(stats.winPct, 33, "1 of 3 → 33%");
  assert.equal(stats.gfPerGame, 1);
  assert.ok(Math.abs(stats.gaPerGame - 4 / 3) < 1e-9);
});

test("kpis: empty input is all-null, never NaN", () => {
  const stats = charts.kpis([]);
  assert.equal(stats.played, 0);
  assert.equal(stats.gfPerGame, null);
  assert.equal(stats.gaPerGame, null);
  assert.equal(stats.winPct, null);
  assert.equal(stats.losses, 0);
});

test("wave 21: the attendance-per-game rate is gone from kpis()", () => {
  const stats = charts.kpis(matches, { appearances: [{ match_id: "t1" }, { match_id: "t2" }] });
  assert.equal("appsPerGame" in stats, false, "no attendance metric, whatever options are passed");
});

test("stepFor: gridline step keeps the tick count ≤ 5", () => {
  assert.equal(charts.stepFor(1), 1);
  assert.equal(charts.stepFor(5), 1);
  assert.equal(charts.stepFor(6), 2);
  assert.equal(charts.stepFor(12), 4);
  assert.equal(charts.stepFor(25), 5);
  assert.equal(charts.stepFor(100), 20);
  assert.equal(charts.stepFor(999), 20, "falls back to the coarsest step");
});

test("trendSVG: one column + chip + score per match", () => {
  const svg = charts.trendSVG(matches.filter((m) => m.ycac_goals != null));
  assert.ok(svg.startsWith("<svg"), "returns markup");
  assert.equal((svg.match(/class="tv-col"/g) || []).length, 3);
  assert.equal((svg.match(/class="tv-chip tv-chip-/g) || []).length, 3);
  assert.equal((svg.match(/class="tv-score"/g) || []).length, 3);
  assert.ok(svg.includes("2–0"), "scoreline rendered");
  assert.equal(charts.trendSVG([]), "", "no matches → no chart");
});

test("trendSVG: goals for sit above the zero line, goals against below it", () => {
  const svg = charts.trendSVG(matches.filter((m) => m.ycac_goals != null));
  const zero = charts.ZERO;
  const rect = (kind, index) => {
    const all = [...svg.matchAll(new RegExp(`<rect class="tv-bar tv-${kind}" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"`, "g"))];
    return all[index];
  };
  const forRect = rect("for", 0); // t2: 1 goal for
  assert.ok(Number(forRect[2]) < zero && Number(forRect[4]) > 0, "for-bar rises above zero");
  const againstRect = rect("against", 2); // t3: 3 against
  assert.equal(Number(againstRect[2]), zero, "against-bar starts on the zero line");
  assert.ok(Number(againstRect[4]) > 0, "and hangs below it");
  assert.ok(svg.includes(`y1="${zero}"`), "zero line drawn");
});

test("trendSVG: labels are escaped", () => {
  const svg = charts.trendSVG([matches[0]]); // opponent "Rovers & Sons"
  assert.ok(svg.includes("Rovers &amp; Sons"));
  assert.ok(!/Rovers & Sons/.test(svg));
});
