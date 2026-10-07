// Unit tests for standings.js — the shipped TML Division 3 league table
//   node --test tests/unit
// The table is hand-maintained (cross-fixtures are not in our database), so
// these guard the arithmetic and published order a human editor can get wrong.
const test = require("node:test");
const assert = require("node:assert/strict");
const standings = require("../../standings.js");

test("wave 25: the division ships with a full, well-formed table", () => {
  assert.ok(standings.rows.length >= 8, `only ${standings.rows.length} teams`);
  assert.ok(standings.competition, "competition labelled");
  assert.match(standings.updated, /^\d{4}-\d{2}-\d{2}$/, "updated is an ISO date");
  for (const row of standings.rows) {
    assert.ok(row.team, "every row names a team");
    for (const key of ["p", "w", "d", "l", "gf", "ga", "pts"]) {
      assert.ok(Number.isInteger(row[key]) && row[key] >= 0, `${row.team}: ${key} is a non-negative integer`);
    }
  }
});

test("wave 25: every row is arithmetically consistent (P, points)", () => {
  for (const row of standings.rows) {
    assert.equal(row.p, row.w + row.d + row.l, `${row.team}: P = W + D + L`);
    assert.equal(row.pts, row.w * 3 + row.d, `${row.team}: 3-1-0 points`);
  }
});

test("wave 25: published order holds — points then goal difference, non-increasing", () => {
  for (let index = 1; index < standings.rows.length; index += 1) {
    const above = standings.rows[index - 1];
    const below = standings.rows[index];
    const abovePts = above.pts, belowPts = below.pts;
    const aboveGd = above.gf - above.ga, belowGd = below.gf - below.ga;
    const ordered = abovePts > belowPts || (abovePts === belowPts && aboveGd >= belowGd);
    assert.ok(ordered, `${above.team} (${abovePts}pts ${aboveGd}) must not sit above ${below.team} (${belowPts}pts ${belowGd})`);
  }
});

test("wave 25: exactly one club row is flagged and it is ours", () => {
  const us = standings.rows.filter((row) => row.us);
  assert.equal(us.length, 1, "one and only one highlighted row");
  assert.match(us[0].team, /YCAC/i, "the flagged row is YC&AC Pulse");
});
