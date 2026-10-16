// Unit tests for update-standings.cjs — the footyjapancompetitions.com parser
// and the shipped-file renderer. The HTML fixture is a real capture of the
// published Division 3 blocks, so site drift or parser regressions fail here
// before they ever reach standings.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseStandings, parseTopScorers, canonicalise, renderFile, todayISO } = require("../../update-standings.cjs");
const fixture = fs.readFileSync(path.join(__dirname, "../fixtures/footy-standings-d3.html"), "utf8");

test("parses the published Division 3 table (ten clubs, our row flagged once)", () => {
  const rows = canonicalise(parseStandings(fixture));
  assert.equal(rows.length, 10);
  assert.equal(rows[0].team, "BFC Tokyo");
  assert.equal(rows[0].pts, 13);
  const us = rows.filter((row) => row.us);
  assert.equal(us.length, 1, "exactly one club row flagged");
  assert.equal(us[0].team, "YCAC Pulse");
  assert.equal(us[0].p, 4);
  for (const row of rows) {
    assert.equal(row.p, row.w + row.d + row.l, `${row.team}: P = W + D + L`);
    assert.equal(row.pts, row.w * 3 + row.d, `${row.team}: 3-1-0 points`);
  }
  // canonical order: points first, then goal difference (the shipped contract)
  for (let index = 1; index < rows.length; index += 1) {
    const above = rows[index - 1];
    const below = rows[index];
    const ordered = above.pts > below.pts || (above.pts === below.pts && (above.gf - above.ga) >= (below.gf - below.ga));
    assert.ok(ordered, `${above.team} must not sit above ${below.team}`);
  }
});

test("parses the published Division 3 top scorers", () => {
  const scorers = parseTopScorers(fixture);
  assert.equal(scorers.length, 4);
  assert.deepEqual(scorers[0], { name: "Ke Sun", club: "YCAC Pulse", goals: 5 });
  assert.equal(scorers[3].name, "Raito Yamamoto");
  assert.equal(scorers[3].goals, 3);
  for (const row of scorers) assert.ok(row.goals >= 1, `${row.name}: at least one goal`);
});

test("refuses tables the shipped contract cannot represent", () => {
  // a point deduction breaks 3-1-0 — stop the run, never ship a red CI
  const deducted = parseStandings(fixture).map((row) => ({ ...row }));
  deducted[0].pts -= 3;
  assert.throws(() => canonicalise(deducted), /3×W\+D/);

  // a missing club row means we parsed the wrong table (or we were renamed)
  const noUs = parseStandings(fixture).map((row) => ({ ...row, team: row.team.replace(/YCAC Pulse/i, "Someone Else FC") }));
  assert.throws(() => canonicalise(noUs), /one YCAC Pulse row/);

  // an unrecognised page structure fails loudly, not emptily
  assert.throws(() => parseStandings("<html><body>restructured</body></html>"), /marker not found/);
  assert.throws(() => parseTopScorers("<html><body>restructured</body></html>"), /marker not found/);
  assert.throws(() => canonicalise(parseStandings(fixture).slice(0, 3)), /only 3 rows/);
});

test("renderFile round-trips into the shipped module shape", () => {
  const rows = canonicalise(parseStandings(fixture));
  const topScorers = parseTopScorers(fixture);
  const source = renderFile({ updated: "2026-10-16", rows, topScorers });
  const sandbox = { module: { exports: {} } };
  new Function("module", "window", source)(sandbox.module, undefined);
  const data = sandbox.module.exports;
  assert.equal(data.competition, "TML Division 3");
  assert.equal(data.updated, "2026-10-16");
  assert.equal(data.rows.length, 10);
  assert.equal(data.rows.filter((row) => row.us).length, 1);
  assert.deepEqual(data.rows[0], rows[0]);
  assert.deepEqual(data.topScorers, topScorers);
  assert.doesNotMatch(source, /gd:/, "goal difference is derived by the renderer, never stored");
});

test("todayISO is a plain local calendar date", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
