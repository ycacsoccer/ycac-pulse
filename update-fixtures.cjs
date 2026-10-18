/* YC&AC Pulse — TML Division 3 fixtures + results feed (update-fixtures.cjs):
     npm run update:fixtures                 fetch → parse → write fixtures.js + sync
     npm run update:fixtures -- --dry-run    preview everything, write nothing
     npm run update:fixtures -- --no-sync    skip the Supabase fixture sync

   Scrapes every page of footyjapancompetitions.com/fixtures-results and keeps
   the <h3>Division 3</h3> sections only: every club's fixtures (date, kickoff,
   venue) and results (score, venue, scorers per side) — the match page's
   "League form" panel reads the generated fixtures.js for both clubs' trend,
   recent results and next fixtures (pure logic lives in league.js).

   The Supabase step (credentials from .env) compares the feed's upcoming
   YC&AC fixtures with the matches table: a fixture the site doesn't have yet
   is INSERTED (deduped by date + normalised opponent, ids continue the mNNN
   series); reschedules, missing results and score mismatches are only ever
   reported for a human — this script never edits or deletes a match row. */
const fs = require("fs");
const path = require("path");

const BASE_URL = "https://www.footyjapancompetitions.com/fixtures-results";
const TARGET = path.join(__dirname, "fixtures.js");
const COMPETITION = "TML Division 3";
const DIVISION = "Division 3"; // the <h3> the site groups our league's rows under
const MAX_PAGES = 15; // safety cap when following the pager
const VENUE_US_FALLBACK = "Yokohama Country & Athletic Club (YC&AC)";

const decode = (text) => String(text == null ? "" : text)
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/\s+/g, " ").trim();

const norm = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const US = norm("YCAC Pulse"); // "ycacpulse" — matches both "YCAC Pulse" and "YC&AC Pulse"
const isUs = (name) => norm(name) === US;

const pad = (value) => String(value).padStart(2, "0");
function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// "Saturday 24th October 2026" → "2026-10-24" (ordinal suffixes and all).
function parseDate(text) {
  const match = String(text).match(/(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})/);
  const month = match && MONTHS[match[2].toLowerCase()];
  if (!month) throw new Error(`date header did not parse: "${String(text).trim()}" — the site markup may have changed`);
  return `${match[3]}-${pad(month)}-${pad(Number(match[1]))}`;
}

// First venue link: fixtures carry it in a venue field inside match-status,
// results in the summary footer — one pattern each, optional (a postponed
// fixture may have no ground published yet).
function venueOf(body) {
  const match = /field--name-field-venue[\s\S]{0,400}?<a[^>]*>([^<]+)<\/a>/.exec(body)
    || /class="venue"><span>\s*<a[^>]*>([^<]+)<\/a>/.exec(body);
  return match ? decode(match[1]) : null;
}

// Goal scorer names for one side of a result (own goals/cards are not
// scorers; count is never validated against the score — the feed's action
// feed is supplementary detail, the score itself is validated separately).
function scorersOf(body, side) {
  const mark = side === "home" ? 'class="actions actions-home"' : 'class="actions actions-away"';
  const start = body.indexOf(mark);
  if (start < 0) return [];
  const endMark = side === "home" ? 'class="actions actions-away"' : "</aside>";
  let end = body.indexOf(endMark, start + mark.length);
  if (end < 0) end = body.length;
  const segment = body.slice(start + mark.length, end);
  const goals = [];
  const action = /<div class="action">([\s\S]*?)<\/div>/g;
  let match;
  while ((match = action.exec(segment))) {
    const type = /action-icon action-([\w-]+)/.exec(match[1]);
    const player = /class="action-player">([^<]+)<\/span>/.exec(match[1]);
    if (type && player && type[1] === "goal") goals.push(decode(player[1]));
  }
  return goals;
}

// One match-teaser article → a typed row, refusing anything the shipped
// contract cannot represent (scores are integers; a win/lose/draw marker must
// agree with the score; both teams present and different).
function parseArticle(body, meta) {
  const side = (which) => {
    const block = new RegExp(`<div class="${which}[^"]*"[^>]*>([\\s\\S]*?)</div>`).exec(body);
    const link = block && /<a href="\/team\/[^"]*"[^>]*>([^<]+)<\/a>/.exec(block[1]);
    return link ? decode(link[1]) : null;
  };
  const home = side("home");
  const away = side("away");
  if (!home || !away) throw new Error(`team names did not parse (node-${meta.node}) — the site markup may have changed`);
  if (home === away) throw new Error(`home and away are the same team (node-${meta.node}): ${home}`);

  const strong = /<strong>([^<]*)<\/strong>/.exec(body);
  const status = strong ? strong[1].trim() : "";

  if (meta.kind === "fixture") {
    return {
      ...meta, home, away,
      time: /^\d{1,2}:\d{2}$/.test(status) ? status : null,
      venue: venueOf(body),
    };
  }

  const score = /^(\d+)\s*-\s*(\d+)$/.exec(status);
  if (!score) throw new Error(`result score did not parse (node-${meta.node}): "${status}" — the site markup may have changed`);
  const hg = Number(score[1]);
  const ag = Number(score[2]);
  const homeClass = (/<div class="home([^"]*)"/.exec(body) || [null, ""])[1];
  const marked = homeClass.includes("result-win") ? 1
    : homeClass.includes("result-lose") ? -1
    : homeClass.includes("result-draw") ? 0 : null;
  const actual = hg > ag ? 1 : hg < ag ? -1 : 0;
  if (marked !== null && marked !== actual) {
    throw new Error(`result marker contradicts the score (node-${meta.node}): home is "${homeClass.trim()}" but the score is ${hg}-${ag}`);
  }
  return {
    ...meta, home, away, hg, ag,
    venue: venueOf(body),
    scorers: { home: scorersOf(body, "home"), away: scorersOf(body, "away") },
  };
}

/* One page of the feed → every match-teaser row with its date-grouping and
   <h3> division in tow. State walks the page in document order: a date header
   resets the division (headers may repeat across the two views' groupings),
   a plain <h3>Division N</h3> sets it, an article captures its own body. */
function parsePage(html) {
  const rows = [];
  let date = null;
  let division = "";
  const token = /<div class="view-grouping-header">\s*([^<\n]+)|<h3>([^<]+)<\/h3>|<article class="([^"]*)"/g;
  let match;
  while ((match = token.exec(html))) {
    if (match[1] !== undefined) { date = parseDate(match[1]); division = ""; continue; }
    if (match[2] !== undefined) { division = decode(match[2]); continue; }
    const classes = match[3];
    if (!/match-teaser/.test(classes)) continue; // a stray <article> outside the listings
    const node = /node-(\d+)/.exec(classes);
    const kind = /match-(fixture|result)/.exec(classes);
    if (!node || !kind) throw new Error(`match article without node id / kind: "${classes}" — the site markup may have changed`);
    if (date === null) throw new Error(`match article node-${node[1]} sits outside any date grouping — the site markup may have changed`);
    const end = html.indexOf("</article>", match.index);
    if (end < 0) throw new Error(`match article node-${node[1]} never closes — the site markup may have changed`);
    const body = html.slice(match.index, end + "</article>".length);
    rows.push(parseArticle(body, { node: node[1], kind: kind[1], date, division }));
  }
  return rows;
}

/* Rows (any divisions) → the shipped feed: Division 3 only, validated,
   deterministically ordered. Loud on a layout that no longer yields a single
   Division 3 row — a silent empty file would quietly blank every panel. */
function canonicalise(rows) {
  const d3 = rows.filter((row) => row.division === DIVISION);
  if (!d3.length) throw new Error("no Division 3 rows parsed — the site layout may have changed (expected <h3>Division 3</h3> sections)");
  const byMatch = (a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home) || a.away.localeCompare(b.away);
  const results = d3.filter((row) => row.kind === "result").map((row) => ({
    date: row.date, home: row.home, away: row.away, hg: row.hg, ag: row.ag,
    venue: row.venue, scorers: row.scorers,
  })).sort(byMatch);
  const fixtures = d3.filter((row) => row.kind === "fixture").map((row) => ({
    date: row.date, home: row.home, away: row.away, time: row.time, venue: row.venue,
  })).sort(byMatch);
  const clubs = [...new Set(d3.flatMap((row) => [row.home, row.away]))].sort();
  if (!d3.some((row) => isUs(row.home) || isUs(row.away))) {
    console.log("note: no YC&AC Pulse rows on the feed (yet)");
  }
  return { results, fixtures, clubs };
}

// The shipped module, byte-compatible with the standings generator's shape.
function renderFile({ updated, clubs, results, fixtures: scheduled }) {
  const quoted = (value) => JSON.stringify(value);
  const resultRow = (row) => `      { date: ${quoted(row.date)}, home: ${quoted(row.home)}, away: ${quoted(row.away)}, hg: ${row.hg}, ag: ${row.ag}, venue: ${quoted(row.venue)}, scorers: { home: ${JSON.stringify(row.scorers.home)}, away: ${JSON.stringify(row.scorers.away)} } },`;
  const fixtureRow = (row) => `      { date: ${quoted(row.date)}, home: ${quoted(row.home)}, away: ${quoted(row.away)}, time: ${quoted(row.time)}, venue: ${quoted(row.venue)} },`;
  return `/* YC&AC Pulse — TML Division 3 fixtures + results, as published by the
   competition. GENERATED by \`npm run update:fixtures\` (update-fixtures.cjs)
   from footyjapancompetitions.com/fixtures-results — run it after each round
   (and when fixtures are announced) instead of editing by hand; it re-validates
   what the unit tests enforce (scores are integers, a result marker agrees with
   the score, Division 3 rows only). The match page's League form panel reads
   both clubs from here: results feed form pills + recent results, fixtures the
   next-up lists (pure logic in league.js). */
(() => {
  const fixtures = {
    competition: ${quoted(COMPETITION)},
    updated: ${quoted(updated)},
    clubs: [${clubs.map(quoted).join(", ")}],
    results: [
${results.map(resultRow).join("\n")}
    ],
    fixtures: [
${scheduled.map(fixtureRow).join("\n")}
    ],
  };
  if (typeof module !== "undefined" && module.exports) module.exports = fixtures;
  if (typeof window !== "undefined") window.YCACFixtures = fixtures;
})();
`;
}

function diff(previous, results, scheduled) {
  const keyOf = (row) => `${row.date}|${row.home}|${row.away}`;
  const changes = [];
  const oldResults = new Map(((previous && previous.results) || []).map((row) => [keyOf(row), row]));
  for (const row of results) {
    const before = oldResults.get(keyOf(row));
    if (!before) changes.push(`  + result ${row.date} ${row.home} ${row.hg}–${row.ag} ${row.away}`);
    else if (before.hg !== row.hg || before.ag !== row.ag) {
      changes.push(`  ! score changed ${row.date} ${row.home} ${before.hg}–${before.ag} → ${row.hg}–${row.ag} ${row.away} — inspect by hand`);
    }
    oldResults.delete(keyOf(row));
  }
  for (const gone of oldResults.values()) changes.push(`  - result gone from the feed: ${gone.date} ${gone.home} ${gone.hg}–${gone.ag} ${gone.away}`);
  const oldFixtures = new Map(((previous && previous.fixtures) || []).map((row) => [keyOf(row), row]));
  for (const row of scheduled) {
    const before = oldFixtures.get(keyOf(row));
    if (!before) changes.push(`  + fixture ${row.date} ${row.home} vs ${row.away}${row.time ? ` ${row.time}` : ""}`);
    else if (before.time !== row.time || before.venue !== row.venue) {
      changes.push(`  ~ fixture details changed ${row.date} ${row.home} vs ${row.away}: ${before.time || "?"} / ${before.venue || "?"} → ${row.time || "?"} / ${row.venue || "?"}`);
    }
    oldFixtures.delete(keyOf(row));
  }
  for (const gone of oldFixtures.values()) changes.push(`  - fixture gone from the feed: ${gone.date} ${gone.home} vs ${gone.away}`);
  return changes;
}

// Every page of the two paged views (the pager's last-page link widens the
// loop as the season grows); a page with no match rows ends the walk early.
async function fetchPages(fetchImpl = fetch) {
  const pages = [];
  let last = 0;
  for (let index = 0; index <= last && index < MAX_PAGES; index++) {
    const url = `${BASE_URL}?page=${index}`;
    const res = await fetchImpl(url, { headers: { "user-agent": "ycac-pulse updater (update-fixtures.cjs)" } });
    if (!res.ok) throw new Error(`fetching ${url} failed: HTTP ${res.status}`);
    const html = await res.text();
    pages.push(html);
    last = Math.max(last, ...[...html.matchAll(/\?page=(\d+)/g)].map((m) => Number(m[1])));
    if (!html.includes("match-teaser")) break;
  }
  return pages;
}

// Deterministic next id from the existing mNNN series (m001, m002, …).
function nextMatchId(matches) {
  let max = 0;
  for (const row of matches) {
    const match = /^m(\d+)$/.exec(row.id || "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `m${pad(max + 1).padStart(3, "0")}`;
}

/* Pure sync plan over the feed and the matches table — unit tested in
   tests/unit/update-fixtures.test.cjs. Inserts only upcoming fixtures the
   site has never seen (same date + opponent = already there); everything
   ambiguous (reschedule, orientation, missing/changed result, site fixture
   the feed hasn't published) is a warning, never a write. */
function planSync(feed, matches, today) {
  const key = (date, opponent) => `${date}|${norm(opponent)}`;
  const known = new Map(matches.map((row) => [key(row.date, row.opponent), row]));
  const open = new Map(matches
    .filter((row) => row.competition === COMPETITION && (row.ycac_goals == null || row.opponent_goals == null))
    .map((row) => [norm(row.opponent), row]));
  const homeVenueRow = matches.find((row) => row.home_away === "home" && /ycac/i.test(row.venue || ""));
  const homeVenue = (homeVenueRow && homeVenueRow.venue) || VENUE_US_FALLBACK;
  const other = (row) => (isUs(row.home) ? row.away : row.home);

  const feedFixtures = feed.fixtures.filter((row) => isUs(row.home) || isUs(row.away));
  const feedResults = feed.results.filter((row) => isUs(row.home) || isUs(row.away));
  const inserts = [];
  const warnings = [];

  for (const row of feedFixtures) {
    const opponent = other(row);
    const present = known.get(key(row.date, opponent));
    if (present) {
      const wantHome = isUs(row.home);
      if ((present.home_away === "home") !== wantHome) {
        warnings.push(`${present.id} vs ${opponent} (${present.date}): the site says ${present.home_away}, the feed says we are ${wantHome ? "home" : "away"} — check the listing`);
      }
      continue;
    }
    const openRow = open.get(norm(opponent));
    if (openRow) {
      warnings.push(`${openRow.id} vs ${opponent}: the site has ${openRow.date}, the feed says ${row.date} — rescheduled? update the match by hand (never auto-moved)`);
      continue;
    }
    if (row.date < today) {
      warnings.push(`the feed still lists a past fixture for us: ${row.date} vs ${opponent} — not inserted`);
      continue;
    }
    inserts.push({
      date: row.date,
      opponent,
      home_away: isUs(row.home) ? "home" : "away",
      venue: isUs(row.home) ? homeVenue : (row.venue || ""),
      kickoff: row.time || null,
      competition: COMPETITION,
    });
  }

  // Published results the site hasn't entered (or entered differently).
  for (const row of feedResults) {
    const opponent = other(row);
    const present = known.get(key(row.date, opponent));
    const ourGoals = isUs(row.home) ? row.hg : row.ag;
    const theirGoals = isUs(row.home) ? row.ag : row.hg;
    if (!present) {
      warnings.push(`published result missing from the site: ${row.date} vs ${opponent} ${ourGoals}–${theirGoals} — enter it in the admin tool`);
    } else if (present.ycac_goals == null) {
      warnings.push(`published result, still unplayed on the site: ${present.id} (${row.date} vs ${opponent} ${ourGoals}–${theirGoals}) — enter the score`);
    } else if (Number(present.ycac_goals) !== ourGoals || Number(present.opponent_goals) !== theirGoals) {
      warnings.push(`${present.id} score differs from the feed: site ${present.ycac_goals}–${present.opponent_goals}, feed ${ourGoals}–${theirGoals} (${row.date} vs ${opponent}) — inspect by hand`);
    }
  }

  // Upcoming D3 rows on the site the feed doesn't list at all — but only
  // within the feed's published horizon: a round the coach added ahead of the
  // competition's own page is normal, a fixture inside the horizon that
  // vanished is worth a line.
  const horizon = feedFixtures.reduce((max, row) => (row.date > max ? row.date : max), "");
  const feedOpponents = new Set(feedFixtures.map((row) => norm(other(row))));
  for (const row of matches) {
    if (row.competition !== COMPETITION || row.ycac_goals != null || row.opponent_goals != null) continue;
    if (row.date > horizon) continue; // beyond anything the feed has published
    if (feedOpponents.has(norm(row.opponent))) continue; // present or already reschedule-warned above
    warnings.push(`${row.id} vs ${row.opponent} (${row.date}) is upcoming on the site but not on the feed — dropped or unpublished?`);
  }

  return { inserts, warnings, feedFixtures: feedFixtures.length, feedResults: feedResults.length };
}

/* Which clubs the feed and the league table disagree about — report-only, by
   normalised name. The site has listed VJ Bridge FC / Zion FC under a
   Division 3 heading with no table row; trust the site's own labels and just
   say it out loud rather than failing the run over someone else's data. */
function clubReport(feedClubs, tableTeams) {
  const listed = new Set(tableTeams.map(norm));
  const known = new Set(feedClubs.map(norm));
  const lines = [];
  for (const club of feedClubs) if (!listed.has(norm(club))) lines.push(`note: on the feed but not in the league table: ${club}`);
  for (const team of tableTeams) if (!known.has(norm(team))) lines.push(`note: in the league table but no feed rows: ${team}`);
  return lines;
}

// Local credentials: a .env file next to this script (git-ignored).
function loadLocalEnv() {
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["'](.*)["']$/, "$1").trim();
    if (value && !(match[1] in process.env)) process.env[match[1]] = value;
  }
}

async function sync(feed, { dryRun }) {
  loadLocalEnv();
  const baseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) {
    console.log("  sync: skipped — no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY (fill in .env to auto-add fixtures)");
    return;
  }
  const res = await fetch(`${baseUrl}/rest/v1/matches?select=id,date,opponent,home_away,competition,venue,kickoff,ycac_goals,opponent_goals`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`reading matches failed: HTTP ${res.status}`);
  const matches = await res.json();
  const plan = planSync(feed, matches, todayISO());
  console.log(`  sync: the feed lists ${plan.feedFixtures} upcoming + ${plan.feedResults} played YC&AC fixtures`);
  if (!plan.inserts.length && !plan.warnings.length) console.log("  sync: site and feed agree — nothing to add");
  for (const insert of plan.inserts) {
    console.log(`  sync: ${dryRun ? "would insert" : "inserting"} ${insert.date} ${insert.home_away === "home" ? "vs" : "at"} ${insert.opponent}${insert.kickoff ? ` ${insert.kickoff}` : ""}`);
  }
  if (plan.warnings.length) {
    console.log("  sync warnings (look at these by hand):");
    for (const line of plan.warnings) console.log(`    ! ${line}`);
  }
  if (dryRun) { if (plan.inserts.length) console.log("  dry run — nothing inserted"); return; }

  let id = nextMatchId(matches);
  for (const insert of plan.inserts) {
    const response = await fetch(`${baseUrl}/rest/v1/matches`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify([{ id, ...insert }]),
    });
    if (!response.ok) throw new Error(`inserting ${id} failed: HTTP ${response.status} ${await response.text()}`);
    console.log(`  sync: inserted ${id} — ${insert.date} ${insert.home_away} vs ${insert.opponent} (appears on the site after the next page load)`);
    id = `m${String(Number(id.slice(1)) + 1).padStart(3, "0")}`;
  }
  if (plan.inserts.length) {
    console.log(`  sync: bump verify-stats.cjs EXPECTED.rows.matches (${matches.length} → ${matches.length + plan.inserts.length}) in the same commit`);
  }
}

async function build({ fetchImpl = fetch } = {}) {
  const pages = await fetchPages(fetchImpl);
  const seen = new Set();
  const rows = pages.flatMap((html) => parsePage(html))
    .filter((row) => (seen.has(row.node) ? false : (seen.add(row.node), true))); // pages overlap at the pager edge
  return { feed: canonicalise(rows), pages: pages.length, updated: todayISO() };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const noSync = process.argv.includes("--no-sync");
  let previous = null;
  try { previous = require(TARGET); } catch (error) { /* first run: no shipped file yet */ }

  const { feed, pages, updated } = await build();
  const changes = diff(previous, feed.results, feed.fixtures);
  const today = todayISO();
  const ourFixtures = feed.fixtures.filter((row) => isUs(row.home) || isUs(row.away));
  const nextUp = ourFixtures.find((row) => row.date >= today);
  const ourResults = feed.results.filter((row) => isUs(row.home) || isUs(row.away));

  console.log(`update:fixtures — ${BASE_URL}`);
  console.log(`  pages fetched:  ${pages}`);
  console.log(`  Division 3:     ${feed.results.length} results + ${feed.fixtures.length} fixtures, ${feed.clubs.length} clubs`);
  console.log(`  our feed lines: ${ourResults.length} results, ${ourFixtures.length} fixtures (next: ${nextUp ? `${nextUp.date} ${isUs(nextUp.home) ? "vs" : "at"} ${isUs(nextUp.home) ? nextUp.away : nextUp.home}${nextUp.time ? ` ${nextUp.time}` : ""}` : "none published"})`);
  console.log(`  feed as of:     ${updated}`);
  // feed clubs vs the shipped league table: a note, never a failure
  try {
    const table = require("./standings.js");
    for (const line of clubReport(feed.clubs, (table.rows || []).map((row) => row.team))) console.log(`  ${line}`);
  } catch (error) { /* standings.js unreadable — the table check just doesn't run */ }
  if (changes.length) { console.log("  changes:"); for (const line of changes) console.log(line); }
  else console.log("  changes: none since the last update");

  if (dryRun) console.log("dry run — fixtures.js not written");
  else {
    fs.writeFileSync(TARGET, renderFile({ updated, clubs: feed.clubs, results: feed.results, fixtures: feed.fixtures }));
    console.log(`fixtures.js rewritten (${feed.results.length} results, ${feed.fixtures.length} fixtures) — commit it to publish`);
  }

  if (noSync) console.log("  sync: skipped (--no-sync)");
  else await sync(feed, { dryRun });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`update:fixtures failed — ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  parseDate, parsePage, canonicalise, renderFile, diff, planSync, nextMatchId, clubReport, todayISO, norm,
};
