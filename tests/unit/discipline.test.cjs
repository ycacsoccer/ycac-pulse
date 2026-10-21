const test = require("node:test");
const assert = require("node:assert/strict");
const { ledger, norm } = require("../../discipline.js");
const competition = "TML Division 3";
const result = (date, names = ["Rick Li"], away = false) => ({ date, home: away ? "Opponent" : "YCAC Pulse", away: away ? "YC&AC Pulse" : "Opponent", hg: 0, ag: 0,
  yellowCards: { home: away ? ["Not our player"] : names, away: away ? names : ["Not our player"] } });
const fixture = (date) => ({ date, home: "YCAC Pulse", away: "Opponent" });
const feed = (results, fixtures = []) => ({ competition, results, fixtures });
const options = (date, extra = {}) => ({ date, today: "2026-10-21", upcoming: true, ...extra });
const three = [result("2026-08-29"), result("2026-09-05", ["RICK LI"], true), result("2026-10-17")];

test("ledger keeps every booking date and opponent, using only our side", () => {
  const rows = ledger(feed(three), options("2026-10-31"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 3);
  assert.deepEqual(rows[0].history.map((card) => card.date), ["2026-08-29", "2026-09-05", "2026-10-17"]);
  assert.ok(rows[0].history.every((card) => card.opponent === "Opponent"));
  assert.equal(rows[0].pending, true, "no published next game keeps the ban pending");
});

test("third yellow bans only the next league fixture, not all future games", () => {
  const data = feed(three, [fixture("2026-10-31"), fixture("2026-11-14")]);
  const row = ledger(data, options("2026-10-31"))[0];
  assert.equal(row.suspended, true);
  assert.equal(row.suspensions[0].served, false, "future fixtures do not count as served");
  assert.equal(ledger(data, options("2026-11-14"))[0].suspended, false);
  assert.equal(ledger(feed(three.slice(0, 2)), options("2026-10-31"))[0].cycle, 2);
});

test("friendlies and past unplayed fixtures cannot clear a ban; DB fixtures fill schedule gaps", () => {
  const matches = [
    { date: "2026-10-18", opponent: "Friendly", competition: "Friendly Match", ycac_goals: 1, opponent_goals: 0 },
    { date: "2026-10-31", opponent: "Opponent", competition, ycac_goals: null, opponent_goals: null },
  ];
  const row = ledger(feed(three, [fixture("2026-10-19")]), options("2026-10-31", { matches }))[0];
  assert.equal(row.suspended, true);
  assert.equal(row.suspensions[0].date, "2026-10-31");
  assert.equal(row.suspensions[0].served, false);
});

test("a played next league match serves the ban even if it has no published actions", () => {
  const matches = [{ date: "2026-10-18", opponent: "Opponent", competition, ycac_goals: 1, opponent_goals: 0 }];
  const row = ledger(feed(three, [fixture("2026-10-31")]), options("2026-10-31", { matches }))[0];
  assert.equal(row.suspended, false);
  assert.equal(row.suspensions[0].served, true);
  assert.equal(row.suspensions[0].date, "2026-10-18");
});

test("six yellows produce a second ban, retaining the first served suspension", () => {
  const results = [...three, result("2026-10-18", []), result("2026-10-24"), result("2026-10-25"), result("2026-10-31")];
  const row = ledger(feed(results, [fixture("2026-11-14")]), options("2026-11-14", { today: "2026-11-01" }))[0];
  assert.equal(row.total, 6);
  assert.equal(row.cycle, 0);
  assert.equal(row.suspended, true);
  assert.deepEqual(row.suspensions.map((ban) => [ban.date, ban.served]), [["2026-10-18", true], ["2026-11-14", false]]);
});

test("a rescheduled official fixture wins over the stale database date", () => {
  const matches = [{ date: "2026-10-24", opponent: "Opponent", competition, ycac_goals: null, opponent_goals: null }];
  const data = feed(three, [fixture("2026-10-31")]);
  const row = ledger(data, options("2026-10-31", { matches }))[0];
  assert.equal(row.suspended, true);
  assert.equal(row.suspensions[0].date, "2026-10-31");
});

test("reviews exclude later cards; upcoming previews exclude same-day cards", () => {
  const data = feed(three);
  assert.equal(ledger(data, options("2026-09-05", { upcoming: false }))[0].total, 2);
  assert.equal(ledger(data, options("2026-09-05"))[0].total, 1);
  assert.equal(ledger(feed([...three, result("2026-11-14")]), options("2026-11-15"))[0].total, 3, "no cards from the future");
});

test("seasons reset in August; duplicates and missing legacy card fields are safe", () => {
  const rows = ledger(feed([result("2026-07-31"), three[0], three[0], { ...result("2026-09-01"), yellowCards: undefined }]), options("2026-10-31"));
  assert.equal(rows[0].total, 1);
  assert.notEqual(norm("王"), norm("李"), "non-Latin player names must not collapse into an empty key");
});
