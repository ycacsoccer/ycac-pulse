// Unit tests for league.js — the pure form/fixture logic over the generated
// fixtures.js feed. Both clubs on a match page read these helpers, so every
// perspective, cut-off and exclusion rule is pinned here rather than in the
// DOM code (which only formats what these return).
const test = require("node:test");
const assert = require("node:assert/strict");

const league = require("../../league.js");

const R = (date, home, away, hg, ag, scorers = { home: [], away: [] }) =>
  ({ date, home, away, hg, ag, venue: "Ground", scorers });
const F = (date, home, away, time = "18:00", venue = "Ground") => ({ date, home, away, time, venue });

// Our five real autumn results + one of ours that isn't theirs, one of theirs
// that isn't ours, and two rows nobody cares about.
const feed = {
  competition: "TML Division 3",
  updated: "2026-10-19",
  clubs: ["BFC Tokyo", "Kilimanjaro FC", "YCAC Pulse"],
  results: [
    R("2026-08-29", "YCAC Pulse", "Albion Old Boys FC", 8, 2, { home: ["Ke Sun"], away: [] }),
    R("2026-09-05", "YCAC Pulse", "F. Lions FC", 4, 0),
    R("2026-09-19", "YCAC Pulse", "Votty SC", 2, 3),
    R("2026-09-20", "Kilimanjaro FC", "BFC Tokyo", 1, 1), // theirs, not ours
    R("2026-10-04", "YCAC Pulse", "BFC Tokyo", 0, 4),
    R("2026-10-17", "YCAC Pulse", "Corinthians Harbour FC", 2, 2, { home: ["Ryu Sato"], away: ["X"] }),
    R("2026-10-25", "Inter Tokyo FC", "YCAC Pulse", 1, 0), // ours, away side
    R("2026-10-26", "YCAC Pulse", "Jetro FC", 1, 2, { home: [], away: ["Y"] }),
    R("2026-10-18", "Albion Old Boys FC", "Kilimanjaro FC", 0, 7), // theirs only
  ],
  fixtures: [
    F("2026-10-24", "BFC Tokyo", "Albion Old Boys FC"), // not ours
    F("2026-10-31", "YCAC Pulse", "Kilimanjaro FC", "18:00", "YC&AC"),
    F("2026-11-07", "Kilimanjaro FC", "YCAC Pulse", "17:00", "Mars"),
    F("2026-11-14", "F. Lions FC", "YCAC Pulse", null, null),
  ],
};

test("norm treats spellings of the same club as one", () => {
  assert.equal(league.norm("YC&AC Pulse"), league.norm("YCAC Pulse"));
  assert.equal(league.norm("F. Lions FC"), league.norm("f lions fc"));
  assert.notEqual(league.norm("FC Nomade"), league.norm("YCAC Pulse"));
});

test("perspective reorders a row from one club's side", () => {
  const home = league.perspective(feed.results[0], "YCAC Pulse");
  assert.equal(home.home, true);
  assert.equal(home.opponent, "Albion Old Boys FC");
  assert.equal(home.gf, 8);
  assert.equal(home.ga, 2);
  assert.equal(home.outcome, "win");
  assert.deepEqual(home.scorers, ["Ke Sun"], "their side of the scorer list");

  const away = league.perspective(feed.results[6], "YC&AC Pulse"); // same club, other spelling
  assert.equal(away.home, false);
  assert.equal(away.opponent, "Inter Tokyo FC");
  assert.equal(away.gf, 0);
  assert.equal(away.ga, 1);
  assert.equal(away.outcome, "loss");

  assert.equal(league.perspective(feed.results[3], "YCAC Pulse"), null, "a stranger's match is not theirs");
});

test("resultsFor reads through a cut-off, oldest first, capped at limit", () => {
  const all = league.resultsFor(feed, "YCAC Pulse", { limit: 99 });
  assert.equal(all.length, 7, "the seven rows involving us, in order");
  assert.equal(all[0].date, "2026-08-29");
  assert.equal(all[all.length - 1].date, "2026-10-26");

  const lastFive = league.resultsFor(feed, "YCAC Pulse");
  assert.equal(lastFive.length, 5, "default window is the last five");
  assert.equal(lastFive[0].date, "2026-09-19");

  const through = league.resultsFor(feed, "YCAC Pulse", { through: "2026-10-04", limit: 99 });
  assert.equal(through.length, 4, "up to and including the cut-off, nothing after it");
  assert.equal(through[through.length - 1].date, "2026-10-04");

  assert.deepEqual(league.resultsFor({}, "YCAC Pulse"), [], "an absent feed is an empty list, not a crash");
});

test("recordOf and streakOf summarise a run of results", () => {
  const rows = league.resultsFor(feed, "YCAC Pulse", { limit: 99 });
  assert.deepEqual(league.recordOf(rows), { p: 7, w: 2, d: 1, l: 4, gf: 17, ga: 14 });
  assert.deepEqual(league.recordOf([]), { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 });

  assert.deepEqual(league.streakOf(rows), { outcome: "loss", length: 2 }, "two losses at the tail");
  const wins = rows.slice(0, 2);
  assert.deepEqual(league.streakOf(wins), { outcome: "win", length: 2 });
  assert.equal(league.streakOf([]), null, "no results → no run");
});

test("scoreSpread buckets a club's goals per game across every published result", () => {
  // seven results: 8, 4, 2, 0, 2, then away 0 and home 1
  // → [0:2, 1:1, 2:2, 3+:2], all season
  const ours = league.scoreSpread(feed, "YCAC Pulse");
  assert.deepEqual(ours, { games: 7, buckets: [2, 1, 2, 2] });
  assert.equal(ours.buckets.reduce((a, b) => a + b, 0), ours.games, "buckets always sum to games");

  // their two rows: 1 and 7 → [0:0, 1:1, 2:0, 3+:1] — a 3+ caps, never overflows
  assert.deepEqual(league.scoreSpread(feed, "Kilimanjaro FC"), { games: 2, buckets: [0, 1, 0, 1] });

  // through cuts off like resultsFor — nothing later than the review date
  const toSep = league.scoreSpread(feed, "YCAC Pulse", { through: "2026-09-05" });
  assert.deepEqual(toSep, { games: 2, buckets: [0, 0, 0, 2] }, "8 and 4 goals both land in 3+");

  assert.deepEqual(league.scoreSpread(feed, "Nobody FC"), { games: 0, buckets: [0, 0, 0, 0] },
    "a club outside the feed gets empty buckets, not a crash");
  assert.deepEqual(league.scoreSpread(null, "YCAC Pulse"), { games: 0, buckets: [0, 0, 0, 0] });
});

test("fixturesFor lists next games from a date, skipping this page's own", () => {
  const upcoming = league.fixturesFor(feed, "YCAC Pulse");
  assert.equal(upcoming.length, 3, "default three, the non-ours row excluded");
  assert.deepEqual(upcoming.map((row) => row.date), ["2026-10-31", "2026-11-07", "2026-11-14"]);
  assert.equal(upcoming[0].opponent, "Kilimanjaro FC");
  assert.equal(upcoming[0].home, true);
  assert.equal(upcoming[1].home, false, "away fixture reads home:false");
  assert.deepEqual(upcoming[2], {
    date: "2026-11-14", opponent: "F. Lions FC", home: false, kickoff: null, venue: "",
  }, "an unpublished kickoff/ground stays honest rather than placeholder");

  const from = league.fixturesFor(feed, "YCAC Pulse", { from: "2026-11-07" });
  assert.deepEqual(from.map((row) => row.date), ["2026-11-07", "2026-11-14"], "from is inclusive");

  const minusOwn = league.fixturesFor(feed, "YCAC Pulse", { skip: { date: "2026-10-31", opponent: "Kilimanjaro FC" } });
  assert.deepEqual(minusOwn.map((row) => row.date), ["2026-11-07", "2026-11-14"],
    "the page's own fixture drops, the return leg against the same club stays");

  assert.deepEqual(league.fixturesFor(feed, "Nobody FC"), [], "a club outside the feed gets nothing");
  assert.deepEqual(league.fixturesFor(null, "YCAC Pulse"), [], "an absent feed is an empty list");
});
