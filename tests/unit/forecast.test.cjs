// Unit tests for forecast.js — the pre-match forecast engine.
//   node --test "tests/unit/*.test.cjs"
// Synthetic rows keep the math deterministic: expected-goals lambdas, the
// Poisson score grid, head-to-head fallback and the honest no-data path.
const test = require("node:test");
const assert = require("node:assert/strict");
const forecast = require("../../forecast.js");

const M = (id, date, competition, opponent, ycac, against, venue = "Home") =>
  ({ id, date, competition, opponent, ycac_goals: ycac, opponent_goals: against, venue });

// League table: a strong YC&AC and a weaker "Titans FC" (positions 1 vs 4).
const table = [
  { team: "BFC Tokyo", p: 4, w: 4, d: 0, l: 0, gf: 17, ga: 4, pts: 12 },
  { team: "Titans FC", p: 4, w: 1, d: 1, l: 2, gf: 6, ga: 10, pts: 4 },
  { team: "Jetro FC", p: 4, w: 2, d: 0, l: 2, gf: 8, ga: 9, pts: 6 },
  { team: "YCAC Pulse", p: 4, w: 3, d: 0, l: 1, gf: 16, ga: 2, pts: 9, us: true },
];

const fixture = { id: "x1", date: "2026-11-01", competition: "TML Division 3", opponent: "Titans FC", ycac_goals: null, opponent_goals: null };

test("outcomeOf and bucketOf classify rows", () => {
  assert.equal(forecast.outcomeOf(M("m", "2026-01-01", "TML", "X", 2, 1)), "win");
  assert.equal(forecast.outcomeOf(M("m", "2026-01-01", "TML", "X", 1, 1)), "draw");
  assert.equal(forecast.outcomeOf(M("m", "2026-01-01", "TML", "X", 0, 3)), "loss");
  assert.equal(forecast.bucketOf("TML Division 3"), "tml");
  assert.equal(forecast.bucketOf("Friendly Match"), "friendly");
  assert.equal(forecast.normName("Corinthians Harbour F.C."), "corinthiansharbourfc");
});

test("league-table path: lambdas blend our attack with their defence", () => {
  const finals = [M("m1", "2026-03-01", "TML Division 3", "Jetro FC", 3, 0)];
  const f = forecast.build({ match: fixture, finals, standingsRows: table, goals: [] });
  assert.ok(f.table);
  assert.equal(f.table.us.pos, 4);
  assert.equal(f.table.them.pos, 2);
  // λ(us) = (our GF/p + their GA/p)/2 = (16/4 + 10/4)/2 = 3.25
  // λ(them) = (their GF/p + our GA/p)/2 = (6/4 + 2/4)/2 = 1.0
  assert.equal(f.lambdas.us, 3.3); // rounded to one decimal for display
  assert.equal(f.lambdas.them, 1);
  assert.equal(f.edge, "us"); // clearly stronger
});

test("probabilities sum to ~1 and the projected score is the grid argmax", () => {
  const f = forecast.build({ match: fixture, finals: [], standingsRows: table, goals: [] });
  const { win, draw, loss } = f.probs;
  assert.ok(Math.abs(win + draw + loss - 1) < 0.01, `sum ${win + draw + loss}`);
  assert.ok(f.probs.projected.us > f.probs.projected.them, "favourite scores more");
  assert.equal(f.lambdas.us, 3.3);
});

test("opponent matching is forgiving about punctuation", () => {
  const f = forecast.build({ match: fixture, finals: [], standingsRows: [table[0], { team: "TITANS  F.C.", p: 4, w: 1, d: 1, l: 2, gf: 6, ga: 10, pts: 4 }, table[3]], goals: [] });
  assert.ok(f.table, "punctuation-insensitive table match");
  assert.equal(f.table.them.pos, 2);
});

test("h2h fallback: expected goals come from past meetings when no table entry", () => {
  const finals = [
    M("a", "2025-09-01", "Friendly Match", "Nomads XI", 5, 0),
    M("b", "2026-03-01", "TML Division 3", "Titans FC", 3, 1),
    M("c", "2026-05-01", "TML Division 3", "Titans FC", 1, 2),
  ];
  const f = forecast.build({ match: fixture, finals, standingsRows: [], goals: [] });
  assert.equal(f.table, null);
  assert.equal(f.lambdas.us, 2); // (3+1)/2
  assert.equal(f.lambdas.them, 1.5); // (1+2)/2
  assert.equal(f.h2h.rows.length, 2);
  assert.equal(f.h2h.record.w, 1);
  assert.equal(f.h2h.record.l, 1);
  assert.equal(f.edge, "us"); // 2.0 vs 1.5 expected goals
});

test("no data: first meeting without a table entry offers no forecast", () => {
  const finals = [M("m1", "2026-03-01", "TML Division 3", "Jetro FC", 2, 0)];
  const f = forecast.build({ match: fixture, finals, standingsRows: [], goals: [] });
  assert.equal(f.probs, null);
  assert.equal(f.lambdas, null);
  assert.equal(f.edge, null);
  assert.equal(f.h2h.rows.length, 0);
  assert.equal(f.h2h.record.played, 0);
});

test("stats and form use the fixture's competition, oldest → newest", () => {
  const finals = [
    M("t1", "2026-03-01", "TML Division 3", "A", 2, 0),
    M("f1", "2026-03-10", "Friendly Match", "B", 4, 4),
    M("t2", "2026-04-01", "TML Division 3", "C", 1, 1),
    M("t3", "2026-05-01", "TML Division 3", "D", 0, 3),
    M("t4", "2026-06-01", "TML Division 3", "E", 4, 1),
    M("t5", "2026-07-01", "TML Division 3", "F", 1, 0),
    M("t6", "2026-08-01", "TML Division 3", "G", 2, 2),
  ];
  const f = forecast.build({ match: fixture, finals, standingsRows: [], goals: [] });
  assert.equal(f.bucket, "tml");
  assert.equal(f.stats.played, 6); // friendlies excluded
  assert.deepEqual([f.stats.w, f.stats.d, f.stats.l], [3, 2, 1]);
  assert.equal(f.stats.gf, 10);
  assert.equal(f.stats.ga, 7);
  assert.equal(f.stats.gfPerGame, 1.7);
  assert.equal(f.stats.gaPerGame, 1.2);
  assert.equal(f.stats.cleanSheets, 2); // t1, t5
  assert.equal(f.stats.winPct, 50);
  assert.equal(f.form.length, 5); // last five of six
  assert.equal(f.form[0].date, "2026-04-01", "oldest first");
  assert.equal(f.form[4].date, "2026-08-01", "newest last");
  assert.deepEqual(f.form.map((row) => row.outcome), ["draw", "loss", "win", "win", "draw"]);
});

test("top scorers come from the season bucket and the head-to-head", () => {
  const finals = [
    M("b", "2026-03-01", "TML Division 3", "Titans FC", 3, 1),
    M("c", "2026-05-01", "TML Division 3", "Titans FC", 1, 2),
    M("d", "2026-06-01", "TML Division 3", "Jetro FC", 2, 0),
  ];
  const goals = [
    { match_id: "b", scorer_id: "rick" },
    { match_id: "b", scorer_id: "rick" },
    { match_id: "c", scorer_id: "urabe" },
    { match_id: "d", scorer_id: "rick" },
    { match_id: "x-friendly", scorer_id: "nobody" }, // other bucket — ignored
  ];
  const f = forecast.build({ match: fixture, finals, standingsRows: [], goals });
  assert.deepEqual(f.topScorer, { playerId: "rick", count: 3 });
  assert.deepEqual(f.h2hScorer, { playerId: "rick", count: 2 });
});
