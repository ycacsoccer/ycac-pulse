const test = require("node:test");
const assert = require("node:assert/strict");
const { ledger, norm } = require("../../discipline.js");
const teamBookings = require("../../team-bookings.js");
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

const muro = { id: "murat", display_name: "Muro", display_name_full: null };
const kilimanjaro = { id: "m007", date: "2026-10-31", opponent: "Kilimanjaro FC", competition,
  home_away: "away", ycac_goals: 2, opponent_goals: 2 };
const nextLeague = { id: "m008", date: "2026-11-15", opponent: "Jetro FC", competition,
  home_away: "away", ycac_goals: null, opponent_goals: null };
const muroOptions = (date, extra = {}) => ({ date, today: "2026-11-01", players: [muro], matches: [kilimanjaro, nextLeague], reports: teamBookings, ...extra });
const muroResult = (date, opponent, names) => ({ date, home: opponent, away: "YCAC Pulse", hg: 2, ag: 2,
  yellowCards: { home: ["Opponent Player"], away: names } });
const muroFixture = { date: "2026-11-15", home: "Jetro FC", away: "YCAC Pulse" };

test("Muro's Kilimanjaro booking is a separate, undated-minute team report keyed to the confirmed player and match", () => {
  assert.deepEqual(teamBookings, [{ id: "m007-murat-yellow-1", match_id: "m007", player_id: "murat" }]);
  const row = ledger(feed([], [muroFixture]), muroOptions("2026-10-31"))[0];
  assert.equal(row.name, "Muro");
  assert.equal(row.playerId, "murat");
  assert.equal(row.total, 1);
  assert.equal(row.publishedTotal, 0);
  assert.equal(row.reportedTotal, 1);
  assert.equal(row.suspended, false);
  assert.equal(row.provisionalSuspended, false);
  assert.deepEqual(row.history.map(({ date, opponent, matchId, source }) => ({ date, opponent, matchId, source })),
    [{ date: "2026-10-31", opponent: "Kilimanjaro FC", matchId: "m007", source: "team" }]);
  assert.ok(!Object.hasOwn(row.history[0], "minute"));
});

test("reported cards respect match date, today, season and league scope", () => {
  const data = feed([], [muroFixture]);
  assert.equal(ledger(data, muroOptions("2026-10-17")).length, 0, "past reviews cannot see a later card");
  assert.equal(ledger(data, muroOptions("2026-10-31", { upcoming: true })).length, 0, "previews exclude same-day cards");
  assert.equal(ledger(data, muroOptions("2026-11-15", { today: "2026-10-30", upcoming: true })).length, 0, "no future reports");
  assert.equal(ledger(data, muroOptions("2027-08-01")).length, 0, "new season starts in August");
  assert.equal(ledger(data, muroOptions("2026-11-15", { club: "Jetro FC" })).length, 0, "reports belong to our club only");
  assert.equal(ledger(data, muroOptions("2026-11-15", { matches: [{ ...kilimanjaro, competition: "Friendly Match" }] })).length, 0, "do not count another competition");
  assert.equal(ledger(data, muroOptions("2026-11-15", { matches: [] })).length, 0, "unknown match IDs are not guessed");
  assert.equal(ledger(data, muroOptions("2026-11-15", { reports: [...teamBookings, ...teamBookings] }))[0].total, 1, "a duplicated report ID counts once");
});

test("a later league card replaces a report only for the same uniquely identified player and match", () => {
  const published = muroResult("2026-10-31", "Kilimanjaro FC", ["MURO"]);
  let rows = ledger(feed([published], [muroFixture]), muroOptions("2026-11-15", { upcoming: true }));
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].total, rows[0].reportedTotal, rows[0].publishedTotal], [1, 0, 1]);
  assert.equal(rows[0].history[0].source, "league");
  assert.equal(rows[0].history[0].matchId, "m007");

  const twoCards = { ...published, yellowCards: { home: [], away: ["Muro", "Muro"] } };
  rows = ledger(feed([twoCards], [muroFixture]), muroOptions("2026-11-15"));
  assert.equal(rows[0].total, 2, "a single team report must not erase an additional published booking");

  const aliased = { ...muro, display_name_full: "Known Full Name" };
  rows = ledger(feed([muroResult("2026-10-31", "Kilimanjaro FC", ["Known Full Name"])], [muroFixture]), muroOptions("2026-11-15", { players: [aliased] }));
  assert.deepEqual([rows.length, rows[0].total, rows[0].reportedTotal], [1, 1, 0], "a real, unique full-name alias also reconciles");

  rows = ledger(feed([muroResult("2026-10-31", "Kilimanjaro FC", ["Unknown Full Name"])], [muroFixture]), muroOptions("2026-11-15"));
  assert.equal(rows.length, 2, "an unrecognized league name must not be guessed as Muro");
  assert.equal(rows.find((row) => row.playerId === "murat").reportedTotal, 1);

  rows = ledger(feed([published], [muroFixture]), muroOptions("2026-11-15", { players: [muro, { id: "other", display_name: "Muro" }] }));
  assert.equal(rows.length, 2, "ambiguous roster names are not merged");
  assert.equal(rows.find((row) => row.playerId === null).publishedTotal, 1);
  rows = ledger(feed([published], [muroFixture]), muroOptions("2026-11-15", { matches: [kilimanjaro, { ...kilimanjaro, id: "another" }, nextLeague] }));
  assert.equal(rows[0].total, 2, "ambiguous match IDs must not cause deduplication");
  assert.equal(rows[0].reportedTotal, 1);
});

test("reports project possible bans without enforcing them; published cards still enforce their own bans", () => {
  const previous = [muroResult("2026-08-29", "Albion FC", ["Muro"]), muroResult("2026-09-05", "BFC Tokyo", ["Muro"])];
  const data = feed(previous, [muroFixture]);
  const row = ledger(data, muroOptions("2026-11-15", { upcoming: true }))[0];
  assert.deepEqual([row.total, row.publishedTotal, row.reportedTotal], [3, 2, 1]);
  assert.equal(row.suspended, false, "an unverified third card must not block squad selection");
  assert.equal(row.provisionalSuspended, true);
  assert.equal(row.suspensions[0].provisional, true);
  assert.equal(row.suspensions[0].date, "2026-11-15");

  const pending = ledger(feed(previous), muroOptions("2026-11-15", { matches: [kilimanjaro], upcoming: true }))[0];
  assert.equal(pending.pending, false);
  assert.equal(pending.provisionalPending, true);

  const laterFixture = { date: "2026-11-29", home: "YCAC Pulse", away: "Zion FC" };
  const thirdPublished = muroResult("2026-11-15", "Jetro FC", ["Muro"]);
  const later = ledger(feed([...previous, thirdPublished], [laterFixture]), muroOptions("2026-11-29", {
    today: "2026-11-16", upcoming: true, matches: [kilimanjaro, { ...nextLeague, ycac_goals: 1, opponent_goals: 1 }],
  }))[0];
  assert.equal(later.total, 4);
  assert.equal(later.suspended, true, "three league-published cards independently cause the existing restriction");
  assert.ok(later.suspensions.some((ban) => ban.provisional && ban.date === "2026-11-15" && ban.served));
  assert.ok(later.suspensions.some((ban) => !ban.provisional && ban.date === "2026-11-29"));
});
