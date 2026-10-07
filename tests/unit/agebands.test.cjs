const test = require("node:test");
const assert = require("node:assert/strict");
const ageBands = require("../../agebands.js");

test("age bands have a stable display order and readable youngest label", () => {
  assert.deepEqual(ageBands.ORDER, ["17-20", "20s", "30s", "40s", "50s"]);
  assert.equal(ageBands.label("17-20"), "17–20");
  assert.equal(ageBands.className("30s"), "age-30s");
});

test("distribution counts active players and returns percentages", () => {
  const rows = ageBands.distribution([
    { age_band: "20s", active: true }, { age_band: "20s", active: true },
    { age_band: "30s", active: true }, { age_band: "50s", active: false },
  ]);
  assert.equal(rows.find((row) => row.band === "20s").count, 2);
  assert.equal(rows.find((row) => row.band === "20s").percent, 67);
  assert.equal(rows.find((row) => row.band === "30s").percent, 33);
  assert.equal(rows.find((row) => row.band === "50s").count, 0, "inactive players are excluded");
});
