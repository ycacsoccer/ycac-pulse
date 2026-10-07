// Unit tests for stats.js — the shared season metrics engine.
//   node --test tests/unit
// Pure data-in/data-out logic (tiers, reliability, per-competition stats)
// against a synthetic season, so a rule change is caught here rather than by
// eyeballing the coach dashboard.
const test = require("node:test");
const assert = require("node:assert/strict");
const YCACStats = require("../../stats.js");

/* --- synthetic season ------------------------------------------------------
   3 TML finals (2-0, 1-1, 0-3), 1 friendly (3-1), 1 upcoming fixture. */
const players = [
  { id: "gk1", display_name: "Keeper One", primary_position: "GK", active: true },
  { id: "df1", display_name: "Back One", primary_position: "CB", active: true },
  { id: "mf1", display_name: "Mid One", primary_position: "CM", active: true },
  { id: "at1", display_name: "Fwd One", primary_position: "ST", active: true },
  { id: "fr1", display_name: "Friendly Only", primary_position: "LW", active: true },
  { id: "xx1", display_name: "Mystery", primary_position: "ZG", active: true },
  { id: "old", display_name: "Retired", primary_position: "ST", active: false },
];

const matches = [
  { id: "f1", date: "2026-02-07", competition: "Friendly Match", opponent: "Blades", ycac_goals: 3, opponent_goals: 1 },
  { id: "t1", date: "2026-03-01", competition: "TML Division 3", opponent: "Rovers", ycac_goals: 2, opponent_goals: 0 },
  { id: "t2", date: "2026-03-15", competition: "TML Division 3", opponent: "Lakeside", ycac_goals: 1, opponent_goals: 1 },
  { id: "t3", date: "2026-04-05", competition: "TML Division 3", opponent: "Hilltop", ycac_goals: 0, opponent_goals: 3 },
  { id: "fx", date: "2026-05-02", competition: "TML Division 3", opponent: "Titans", ycac_goals: null, opponent_goals: null },
];

const A = (match_id, player_id, role) => ({ match_id, player_id, role });
const appearances = [
  A("t1", "gk1", "starter"), A("t2", "gk1", "starter"), A("t3", "gk1", "starter"), A("f1", "gk1", "starter"),
  A("t1", "df1", "starter"), A("t2", "df1", "sub"),
  A("t1", "mf1", "starter"),
  A("f1", "at1", "starter"),
  A("f1", "fr1", "starter"),
];
const goals = [
  { match_id: "t1", scorer_id: "mf1", assist_id: "df1" },
  { match_id: "f1", scorer_id: "at1", assist_id: null },
];

const season = YCACStats.computeSeason({ players, matches, appearances, goals });
const entry = (id) => season.players.find((row) => row.id === id);

test("primitives: isFinal, competitionBucket, positionGroup, percent", () => {
  assert.equal(YCACStats.isFinal(matches.find((m) => m.id === "t1")), true);
  assert.equal(YCACStats.isFinal(matches.find((m) => m.id === "fx")), false, "null scores = fixture");
  // competitionBucket is internal — its behaviour shows up in the bucket counts below
  assert.equal(YCACStats.positionGroup("CM"), "MF");
  assert.equal(YCACStats.positionGroup("ZG"), "Other", "unknown position falls back to Other");
  assert.equal(YCACStats.positionGroup(undefined), "Other");
  // percent() is internal — its rounding shows up in appearance_pct below (2/3 → 67)
});

test("buckets: TML / friendly / all / fixtures partition the season", () => {
  assert.equal(season.buckets.tml.length, 3);
  assert.equal(season.buckets.friendly.length, 1);
  assert.equal(season.buckets.all.length, 4, "only finals count");
  assert.equal(season.fixtures.length, 1);
  assert.deepEqual(season.counts.matches, { tml: 3, friendly: 1, other: 0, all: 4, upcoming: 1 });
  assert.equal(season.counts.players, 6, "inactive player is filtered out");
  assert.equal(entry("old"), undefined);
  assert.equal(season.counts.used, 5, "everyone but Mystery has an appearance");
});

test("summarize: apps, starts, subs, goals, assists, clean sheets, run", () => {
  const gk = entry("gk1").competitions.tml;
  assert.equal(gk.played, 3);
  assert.equal(gk.starts, 3);
  assert.equal(gk.subs, 0);
  assert.equal(gk.appearance_pct, 100);
  assert.equal(gk.clean_sheets, 1, "only t1 was a starter in a 0-conceded match");
  assert.equal(gk.current_run, 3, "played the last three TML matches in a row");
  assert.equal(gk.last_appearance, "2026-04-05");

  const mf = entry("mf1").competitions.tml;
  assert.equal(mf.goals, 1);
  assert.equal(mf.assists, 0);
  assert.equal(entry("df1").competitions.tml.assists, 1);
  assert.equal(entry("at1").competitions.all.goals, 1, "friendly goal counts in the all bucket");

  const outfieldCs = entry("df1").competitions.tml.clean_sheets;
  assert.equal(outfieldCs, 0, "clean sheets are a GK stat only");
});

test("tiers: core needs TML ≥67%; friendlies never promote", () => {
  assert.equal(entry("gk1").tier, "core", "3/3 TML = 100%");
  assert.equal(entry("df1").tier, "core", "2/3 TML = 67% — exactly on the line");
  assert.equal(entry("mf1").tier, "rotation", "1/3 TML = 33% — exactly on the rotation line");
  assert.equal(entry("at1").tier, "depth", "1/4 overall = 25% (< 50%) and 0 TML");
  assert.equal(entry("fr1").tier, "depth", "100% of ONE friendly is still just depth");
  assert.equal(entry("xx1").tier, "inactive");
});

test("reliability: 0.6 × TML% + 0.4 × friendly%", () => {
  assert.equal(entry("gk1").reliability, 100, "100 TML + 100 friendly");
  assert.equal(entry("df1").reliability, 40, "0.6×67 + 0.4×0 = 40.2 → 40");
  assert.equal(entry("xx1").reliability, 0, "no appearances but matches exist → 0, not null");
});

test("coach override wins over the derived tier", () => {
  const overridden = YCACStats.computeSeason({
    players, matches, appearances, goals,
    statusOverrides: { xx1: { squad_status: "rotation" } },
  });
  const row = overridden.players.find((p) => p.id === "xx1");
  assert.equal(row.tier, "rotation");
});

test("ranked: core first, then reliability, then name", () => {
  const order = YCACStats.ranked(season.players).map((row) => row.id);
  assert.deepEqual(order.slice(0, 2), ["gk1", "df1"], "both core, higher reliability first");
  assert.equal(order[order.length - 1], "xx1", "the inactive player sorts last");
  assert.ok(!order.includes("old"), "inactive (active:false) players never reach the board");
  const tiers = YCACStats.ranked(season.players).map((row) => row.tier);
  const index = (tier) => tiers.indexOf(tier);
  assert.ok(index("core") < index("rotation"), "core groups before rotation");
  assert.ok(index("rotation") < index("depth"), "rotation groups before depth");
  assert.ok(index("depth") < index("inactive"), "depth groups before inactive");
});

test("coverage: position group × tier matrix", () => {
  const coverage = YCACStats.coverage(season.players);
  assert.equal(coverage.GK.core.length, 1);
  assert.equal(coverage.DF.core[0].id, "df1");
  assert.equal(coverage.MF.rotation[0].id, "mf1");
  assert.equal(coverage.Other.inactive[0].id, "xx1", "unknown position lands in Other");
  assert.deepEqual(coverage.AT.depth.map((row) => row.id), ["at1", "fr1"], "both friendly-scoring strikers are depth");
});
