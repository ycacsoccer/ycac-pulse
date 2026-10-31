const test = require("node:test");
const assert = require("node:assert/strict");
const { generate } = require("../../social-media.js");

const hashtags = "#YCACPulse #YCAC #YCACSoccer #YokohamaFootball #FootballInJapan";
const match = { opponent: "Kilimanjaro FC", ycac_goals: null, opponent_goals: null };

test("the lineup caption uses the actual opponent and the requested hashtags", () => {
  assert.deepEqual(generate(match), {
    kind: "lineup",
    text: `⚽️ MATCH DAY! 🔴⚫️\n\nReady to take on Kilimanjaro FC! 💪\n\n${hashtags}`,
  });
  assert.match(generate({ ...match, opponent: "  Other   FC " }).text, /Ready to take on Other FC!/);
});

test("full-time captions use YC&AC-first scores and reflect wins, draws and losses", () => {
  for (const [us, them, line] of [
    [3, 1, "A win against Kilimanjaro FC!"],
    [2, 2, "All square against Kilimanjaro FC."],
    [0, 4, "Defeat against Kilimanjaro FC."],
    [0, 0, "All square against Kilimanjaro FC."],
  ]) {
    const draft = generate({ ...match, home_away: "away", ycac_goals: us, opponent_goals: them });
    assert.equal(draft.kind, "fullTime");
    assert.ok(draft.text.startsWith(`FULL TIME | ${us}–${them} ⚽️🔴⚫️`));
    assert.ok(draft.text.includes(line));
    assert.ok(draft.text.endsWith(hashtags));
    assert.doesNotMatch(draft.text, /tough battle|dominat|comeback/i);
  }
  assert.match(generate({ ...match, ycac_goals: "2", opponent_goals: "1" }).text, /^FULL TIME \| 2–1/);
});

test("unknown opponents and incomplete or invalid results never invent facts", () => {
  const upcoming = generate({});
  assert.equal(upcoming.kind, "lineup");
  assert.match(upcoming.text, /Ready to go, Pulse!/);
  assert.doesNotMatch(upcoming.text, /undefined|null|TBC|FULL TIME/i);
  assert.equal(generate({ ...match, ycac_goals: 0 }).kind, "lineup");
  for (const [us, them, expected] of [[1, 0, "A win for Pulse!"], [0, 0, "All square at full time."], [0, 1, "Defeat at full time."]]) {
    const draft = generate({ opponent: " ", ycac_goals: us, opponent_goals: them });
    assert.ok(draft.text.includes(expected));
    assert.doesNotMatch(draft.text, /undefined|null|TBC/i);
  }
  for (const score of ["", " ", "TBC", "1.5", -1, 1.5, NaN, Infinity, true]) {
    assert.equal(generate({ ...match, ycac_goals: score, opponent_goals: 1 }), null);
  }
});
