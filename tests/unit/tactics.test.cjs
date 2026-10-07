const test = require("node:test");
const assert = require("node:assert/strict");
const tactics = require("../../tactics.js");

const players = [
  { id: "gk", display_name: "Keeper", primary_position: "GK", secondary_positions: [] },
  { id: "cb", display_name: "Centre Back", primary_position: "CB", secondary_positions: ["DM"] },
  { id: "lb", display_name: "Left Back", primary_position: "LB", secondary_positions: ["CB"] },
  { id: "cm", display_name: "Midfielder", primary_position: "CM", secondary_positions: ["AM"] },
  { id: "st", display_name: "Striker", primary_position: "ST", secondary_positions: ["LW"] },
];

test("four common formations each define a complete XI", () => {
  assert.deepEqual(Object.keys(tactics.FORMATIONS), ["4-2-3-1", "4-4-2", "4-3-3", "3-5-2"]);
  Object.values(tactics.FORMATIONS).forEach((formation) => assert.equal(formation.slots.length, 11, formation.name));
});

test("coverage includes best and capable positions without counting injuries", () => {
  const coverage = tactics.coverage(players, "4-3-3", new Set(["st"]));
  const leftWing = coverage.find((slot) => slot.id === "lw");
  assert.equal(leftWing.candidates.length, 1);
  assert.equal(leftWing.candidates[0].fit, "capable");
  assert.equal(leftWing.count, 0, "injured candidate is not available coverage");
  assert.equal(leftWing.unavailableCount, 1);

  const leftBack = coverage.find((slot) => slot.id === "lb");
  assert.equal(leftBack.count, 1);
  assert.equal(leftBack.bestCount, 1);
  assert.equal(leftBack.capableCount, 0);
  assert.equal(leftBack.available[0].fit, "best");
});

test("centre-back can-play data contributes to each centre-back slot", () => {
  const coverage = tactics.coverage(players, "4-2-3-1");
  for (const id of ["lcb", "rcb"]) {
    assert.deepEqual(coverage.find((slot) => slot.id === id).available.map((player) => player.id), ["cb", "lb"]);
  }
});

test("heat levels describe zero, thin, fair and strong coverage", () => {
  assert.deepEqual([0, 1, 2, 3, 8].map(tactics.heat), ["empty", "thin", "fair", "strong", "strong"]);
});
