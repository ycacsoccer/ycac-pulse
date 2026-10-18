// Unit tests for update-fixtures.cjs — the footyjapancompetitions.com
// fixtures-results parser, the shipped-file renderer, the change report and
// the pure Supabase sync plan. The HTML fixture is a real capture of six
// published date-groupings (all divisions inside them), so site drift or
// parser regressions fail here before they ever reach fixtures.js.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  parseDate, parsePage, canonicalise, renderFile, diff, planSync, nextMatchId, clubReport, todayISO,
} = require("../../update-fixtures.cjs");
const fixture = fs.readFileSync(path.join(__dirname, "../fixtures/footy-fixtures-d3.html"), "utf8");

// One minimal match-teaser in the published structure; callers tweak status,
// markers and team links to build every refusal case.
const resultArticle = ({ node = "999", status = "0 - 7", homeClass = "result-win", awayLink = true } = {}) => `
  <article class="match-teaser node-${node} match-result">
    <div class="match-body">
      <div class="home ${homeClass}"><img src="/a.png" alt=""><a href="/team/foo">Foo FC</a></div>
      <div class="match-status"><strong>${status}</strong></div>
      <div class="away"><${awayLink ? 'a href="/team/bar">Bar FC</a>' : "span>Bar FC</span>"}<img src="/b.png" alt=""></div>
    </div>
  </article>`;
const pageOf = (dateLine, division, article) =>
  `<div class="view-grouping-header">\n${dateLine}\n</div>\n<h3>${division}</h3>\n${article}`;

test("parses English ordinal date headers", () => {
  assert.equal(parseDate("Saturday 24th October 2026"), "2026-10-24");
  assert.equal(parseDate("Sunday 1st November 2026"), "2026-11-01");
  assert.equal(parseDate("Monday 12th October 2026"), "2026-10-12");
  assert.equal(parseDate("Wednesday 22nd September 2026"), "2026-09-22");
  assert.throws(() => parseDate("Coming soon"), /date header did not parse/);
});

test("parses fixtures and results from the real capture, Division 3 only", () => {
  const rows = parsePage(fixture);
  // the capture really carries other divisions — filtering is exercised, not assumed
  assert.ok(rows.some((row) => row.division === "Division 1"), "capture contains Division 1 rows");
  assert.ok(rows.some((row) => row.division === "Division 2"), "capture contains Division 2 rows");

  const feed = canonicalise(rows);
  assert.equal(feed.results.length, 4);
  assert.equal(feed.fixtures.length, 3);
  assert.deepEqual(feed.clubs, [...feed.clubs].slice().sort(), "clubs sorted");
  assert.equal(feed.clubs.length, 9);
  for (const absent of ["FC Nomade", "King George FC", "Eastern Capital FC", "Dutch FC", "Hibernian FC", "Pumas FC"]) {
    assert.ok(!feed.clubs.includes(absent), `${absent} (another division) must not reach the feed`);
  }

  // our upcoming fixture: date, kickoff, venue, orientation
  const upcoming = feed.fixtures.find((row) => row.home === "YCAC Pulse");
  assert.deepEqual(upcoming, {
    date: "2026-10-31", home: "YCAC Pulse", away: "Kilimanjaro FC", time: "18:00", venue: "YC&AC",
  });

  // our m006 result: score from both sides' view + the scorer actions
  const m006 = feed.results.find((row) => row.date === "2026-10-17" && row.home === "YCAC Pulse");
  assert.equal(m006.hg, 2);
  assert.equal(m006.ag, 2);
  assert.equal(m006.venue, "YC&AC");
  assert.deepEqual(m006.scorers.home, ["Ryu Sato", "Shinnosuke Kitagawa"]);
  assert.deepEqual(m006.scorers.away, ["Masaki Sato", "Kosuke Hirano"]);

  // a big away win carries both the marker and the scorer list
  const rout = feed.results.find((row) => row.date === "2026-10-18");
  assert.equal(rout.home, "Albion Old Boys FC");
  assert.equal(rout.hg, 0);
  assert.equal(rout.ag, 7);
  assert.ok(rout.scorers.away.includes("Kalifa Diabate"));

  // draws parse (both 5-5 and 0-0 are in the capture)
  const five = feed.results.find((row) => row.hg === 5 && row.ag === 5);
  assert.equal(five && five.home, "BFC Tokyo");
  const nil = feed.results.find((row) => row.hg === 0 && row.ag === 0);
  assert.equal(nil && nil.home, "Votty SC");

  // deterministic order: oldest results first, soonest fixtures first
  for (let index = 1; index < feed.results.length; index += 1) {
    assert.ok(feed.results[index - 1].date <= feed.results[index].date, "results ordered by date");
  }
  for (let index = 1; index < feed.fixtures.length; index += 1) {
    assert.ok(feed.fixtures[index - 1].date <= feed.fixtures[index].date, "fixtures ordered by date");
  }
});

test("refuses pages the shipped contract cannot represent", () => {
  // nothing recognisable at all
  assert.throws(() => canonicalise(parsePage("<html><body>restructured</body></html>")), /no Division 3 rows/);
  // a whole capture renamed out of Division 3 → refuse, never ship an empty feed
  const redivided = parsePage(fixture).map((row) => ({ ...row, division: "Division 1" }));
  assert.throws(() => canonicalise(redivided), /no Division 3 rows/);

  // score that is not two integers
  assert.throws(
    () => parsePage(pageOf("Saturday 24th October 2026", "Division 3", resultArticle({ status: "two - one" }))),
    /score did not parse/,
  );
  // result marker contradicting the score (declared winner, lost 0-7)
  assert.throws(
    () => parsePage(pageOf("Saturday 24th October 2026", "Division 3", resultArticle({ status: "0 - 7", homeClass: "result-win" }))),
    /marker contradicts the score/,
  );
  // a team side without a team link
  assert.throws(
    () => parsePage(pageOf("Saturday 24th October 2026", "Division 3", resultArticle({ awayLink: false }))),
    /team names did not parse/,
  );
  // a date header the parser cannot turn into an ISO date
  assert.throws(
    () => parsePage(pageOf("Coming soon", "Division 3", resultArticle())),
    /date header did not parse/,
  );
  // an article with no date grouping above it
  assert.throws(() => parsePage(resultArticle()), /outside any date grouping/);
});

test("renderFile round-trips into the shipped module shape", () => {
  const feed = canonicalise(parsePage(fixture));
  const source = renderFile({ updated: "2026-10-19", ...feed });
  const sandbox = { module: { exports: {} }, window: {} };
  new Function("module", "window", source)(sandbox.module, sandbox.window);
  const data = sandbox.module.exports;
  assert.equal(data.competition, "TML Division 3");
  assert.equal(data.updated, "2026-10-19");
  assert.equal(data.results.length, feed.results.length);
  assert.equal(data.fixtures.length, feed.fixtures.length);
  assert.deepEqual(data.results[0], feed.results[0]);
  assert.deepEqual(data.fixtures[feed.fixtures.length - 1], feed.fixtures[feed.fixtures.length - 1]);
  assert.equal(sandbox.window.YCACFixtures, data, "browser build reads the same object");
  assert.doesNotMatch(source, /:\s*undefined/, "nulls render as null, never as the text undefined");
});

test("diff reports additions, edits and drops since the shipped file", () => {
  const feed = canonicalise(parsePage(fixture));
  assert.deepEqual(diff(feed, feed.results, feed.fixtures), [], "nothing changed → no report");

  const previous = {
    results: feed.results.slice(0, -1).map((row, index) => (index === 0 ? { ...row, hg: 9, ag: 9 } : row)),
    fixtures: feed.fixtures.concat([{ date: "2026-12-05", home: "Jetro FC", away: "Votty SC", time: "14:00", venue: "Ground" }]),
  };
  const changes = diff(previous, feed.results, feed.fixtures);
  assert.ok(changes.some((line) => line.includes("+ result") && line.includes(feed.results[feed.results.length - 1].date)), "added result reported");
  assert.ok(changes.some((line) => line.startsWith("  ! score changed") && line.includes("9–9 →")), "score edit reported");
  assert.ok(changes.some((line) => line.startsWith("  - fixture gone") && line.includes("Jetro FC")), "dropped fixture reported");
  assert.equal(changes.length, 3, "only the real differences are reported");
});

test("planSync inserts only upcoming fixtures the site has never seen", () => {
  const feed = {
    results: [
      { date: "2026-10-17", home: "YCAC Pulse", away: "Corinthians Harbour FC", hg: 2, ag: 2, venue: "YC&AC", scorers: { home: [], away: [] } },
    ],
    fixtures: [
      { date: "2026-10-31", home: "YCAC Pulse", away: "Kilimanjaro FC", time: "18:00", venue: "YC&AC" }, // already m007
      { date: "2026-11-14", home: "F. Lions FC", away: "YCAC Pulse", time: "15:00", venue: "Fujisawa Ground" }, // new → insert
      { date: "2026-01-05", home: "YCAC Pulse", away: "Jetro FC", time: "14:00", venue: "YC&AC" }, // stale past line → warn only
      { date: "2026-11-07", home: "YCAC Pulse", away: "Kilimanjaro FC", time: "18:00", venue: "YC&AC" }, // m007 on another date → reschedule warn
    ],
    clubs: [],
  };
  const matches = [
    { id: "m006", date: "2026-10-17", opponent: "Corinthians Harbour FC", home_away: "home", competition: "TML Division 3", ycac_goals: 2, opponent_goals: 2, venue: "Yokohama Country & Athletic Club (YC&AC)" },
    { id: "m007", date: "2026-10-31", opponent: "Kilimanjaro FC", home_away: "home", competition: "TML Division 3", ycac_goals: null, opponent_goals: null, venue: "Yokohama Country & Athletic Club (YC&AC)", kickoff: "18:00" },
    { id: "f001", date: "2026-11-22", opponent: "Saint Luxun", home_away: "away", competition: "Friendly Match", ycac_goals: null, opponent_goals: null, venue: "Somewhere" },
  ];
  const plan = planSync(feed, matches, "2026-10-19");

  assert.deepEqual(plan.inserts, [{
    date: "2026-11-14",
    opponent: "F. Lions FC",
    home_away: "away",
    venue: "Fujisawa Ground",
    kickoff: "15:00",
    competition: "TML Division 3",
  }], "one brand-new upcoming fixture, away venue taken from the feed");

  assert.equal(plan.feedFixtures, 4);
  assert.equal(plan.feedResults, 1);
  // the agreeing m006 result and the friendly row produce no noise at all
  assert.ok(!plan.warnings.some((line) => line.includes("m006")), "matching result stays quiet");
  assert.ok(!plan.warnings.some((line) => line.includes("f001")), "friendly fixture is out of scope");
  // reschedule + stale past line are reported, never written
  assert.ok(plan.warnings.some((line) => line.includes("m007") && line.includes("rescheduled")), "date drift reported");
  assert.ok(plan.warnings.some((line) => line.includes("past fixture") && line.includes("Jetro FC")), "stale past line reported");
  assert.equal(plan.warnings.length, 2, "exactly the two known discrepancies");
});

test("planSync reports mismatches and unknowns without ever editing", () => {
  const feed = {
    results: [
      { date: "2026-10-17", home: "YCAC Pulse", away: "Corinthians Harbour FC", hg: 3, ag: 1, venue: "YC&AC", scorers: { home: [], away: [] } }, // site says 2-2
      { date: "2026-09-19", home: "YCAC Pulse", away: "Votty SC", hg: 2, ag: 3, venue: "YC&AC", scorers: { home: [], away: [] } }, // missing on site
    ],
    fixtures: [
      { date: "2026-12-05", home: "Jetro FC", away: "YCAC Pulse", time: "14:00", venue: "Jetro Ground" }, // feed: away; site: home
      { date: "2026-12-13", home: "YCAC Pulse", away: "Inter Tokyo FC", time: "18:00", venue: "YC&AC" }, // never seen
    ],
    clubs: [],
  };
  const matches = [
    { id: "m006", date: "2026-10-17", opponent: "Corinthians Harbour FC", home_away: "home", competition: "TML Division 3", ycac_goals: 2, opponent_goals: 2, venue: "YC&AC" },
    { id: "m008", date: "2026-12-05", opponent: "Jetro FC", home_away: "home", competition: "TML Division 3", ycac_goals: null, opponent_goals: null, venue: "YC&AC" },
    { id: "m009", date: "2027-01-10", opponent: "Kilimanjaro FC", home_away: "away", competition: "TML Division 3", ycac_goals: null, opponent_goals: null, venue: "Kilimanjaro Ground" },
  ];
  const plan = planSync(feed, matches, "2026-10-19");

  assert.equal(plan.inserts.length, 1, "only the unknown upcoming fixture is insertable");
  assert.equal(plan.inserts[0].opponent, "Inter Tokyo FC");
  assert.ok(!plan.warnings.some((line) => line.includes("m009")), "a round beyond the feed's published horizon is a non-event");

  assert.ok(plan.warnings.some((line) => line.includes("m006") && line.includes("site 2–2, feed 3–1")), "score disagreement surfaced");
  assert.ok(plan.warnings.some((line) => line.includes("Votty SC") && line.includes("missing from the site")), "unentered result surfaced");
  assert.ok(plan.warnings.some((line) => line.includes("m008") && line.includes("we are away")), "orientation disagreement surfaced");
  // the result/mismatch warnings cover the feed rows; nothing else creeps in
  assert.equal(plan.warnings.length, 3, "exactly the three discrepancies");
});

test("nextMatchId continues the mNNN series", () => {
  assert.equal(nextMatchId([]), "m001");
  assert.equal(nextMatchId([{ id: "m006" }, { id: "m007" }, { id: "f001" }]), "m008");
  assert.equal(nextMatchId([{ id: "m104" }, { id: "m002" }]), "m105");
});

test("clubReport points out table/feed disagreements without failing", () => {
  assert.deepEqual(
    clubReport(["YCAC Pulse", "VJ Bridge FC", "Zion FC"], ["YCAC Pulse", "BFC Tokyo"]),
    [
      "note: on the feed but not in the league table: VJ Bridge FC",
      "note: on the feed but not in the league table: Zion FC",
      "note: in the league table but no feed rows: BFC Tokyo",
    ],
  );
  assert.deepEqual(clubReport(["YC&AC Pulse"], ["YCAC Pulse"]), [], "spellings of one club are not a disagreement");
  assert.deepEqual(clubReport([], []), []);
});

test("the shipped fixtures.js holds only rows the panels can render", () => {
  const feed = require("../../fixtures.js");
  assert.equal(feed.competition, "TML Division 3");
  assert.match(feed.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(feed.clubs, [...feed.clubs].slice().sort(), "clubs sorted");
  assert.equal(new Set(feed.clubs).size, feed.clubs.length, "clubs unique");
  const known = new Set(feed.clubs);

  for (const row of feed.results) {
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(row.home, row.away, "nobody plays itself");
    assert.ok(Number.isInteger(row.hg) && row.hg >= 0, `${row.date}: home score`);
    assert.ok(Number.isInteger(row.ag) && row.ag >= 0, `${row.date}: away score`);
    assert.ok(Array.isArray(row.scorers.home) && Array.isArray(row.scorers.away), `${row.date}: scorer lists`);
    assert.ok(known.has(row.home) && known.has(row.away), `${row.date}: teams listed in clubs`);
  }
  for (const row of feed.fixtures) {
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(row.home, row.away, "nobody plays itself");
    assert.ok(row.time === null || /^\d{1,2}:\d{2}$/.test(row.time), `${row.date}: kickoff is a time or null`);
    assert.ok(known.has(row.home) && known.has(row.away), `${row.date}: teams listed in clubs`);
  }
  // while the feed carries any rows at all, our club must be one of them —
  // a rename upstream would otherwise blank the match panel silently
  if (feed.results.length + feed.fixtures.length > 0) {
    const norm = (value) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
    assert.ok(feed.clubs.some((club) => norm(club) === "ycacpulse"), "YC&AC is in the feed");
  }
});

test("todayISO is a plain local calendar date", () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});
