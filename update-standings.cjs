// League-table updater — pulls the TML Division 3 standings and the league
// top scorers from the competition's published page into the shipped data
// file, replacing the hand-edit round this table used to need:
//   npm run update:standings            fetch, validate, rewrite standings.js
//   npm run update:standings -- --dry-run   preview the diff, write nothing
// The published page (footyjapancompetitions.com/standings) is Drupal-marked
// up with semantic cell classes, so parsing is class-based and fails loudly
// if the site ever restructures. Everything the unit tests enforce (P = W+D+L,
// 3-1-0 points, points-then-GD order, exactly one YCAC Pulse row) is
// re-checked here BEFORE anything is written — a point deduction on the
// published table (points in red) breaks 3-1-0 and is refused so a human
// decides how the site should show it. Goal difference is never stored: the
// renderer derives gf − ga so it cannot drift.
const fs = require("fs");
const path = require("path");

const PAGE_URL = "https://www.footyjapancompetitions.com/standings";
const TARGET = path.join(__dirname, "standings.js");
const COMPETITION = "TML Division 3";
const DIVISION = "division-3"; // our division: us and every upcoming opponent
const US = /ycac pulse/i;

const decode = (text) => text
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/\s+/g, " ").trim();

const num = (text) => {
  const match = String(text == null ? "" : text).match(/-?\d+/);
  return match ? Number(match[0]) : NaN;
};

// One sibling block of the page: from its opening div to the next block of
// the same family (or the end of the page).
function section(html, marker) {
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`marker not found in the page: ${marker} — the site layout may have changed`);
  const rest = html.slice(start + marker.length);
  const next = rest.search(/<div class="(?:league-table|top-scorers) /);
  return html.slice(start, start + marker.length + (next < 0 ? rest.length : next));
}

// <tr> cells keyed by the first class of each <td> ("points active" → points).
function rowsOf(block) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let tr;
  while ((tr = trRe.exec(block))) {
    const cells = {};
    const tdRe = /<td[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g;
    let td;
    while ((td = tdRe.exec(tr[1]))) cells[td[1].split(/\s+/)[0]] = decode(td[2]);
    if (Object.keys(cells).length) rows.push(cells);
  }
  return rows;
}

function parseStandings(html) {
  const rows = rowsOf(section(html, `<div class="league-table ${DIVISION}">`)).map((cells) => ({
    team: cells["team-name"],
    p: num(cells["played-games"]),
    w: num(cells["wins"]),
    d: num(cells["draws"]),
    l: num(cells["losses"]),
    gf: num(cells["goals-for"]),
    ga: num(cells["goals-against"]),
    pts: num(cells["points"]),
  }));
  if (rows.some((row) => !row.team || ["p", "w", "d", "l", "gf", "ga", "pts"].some((key) => !Number.isInteger(row[key]) || row[key] < 0))) {
    throw new Error("standings rows did not parse to non-negative integers — the site markup may have changed");
  }
  return rows;
}

function parseTopScorers(html) {
  const rows = rowsOf(section(html, `<div class="top-scorers ${DIVISION}">`)).map((cells) => ({
    name: cells["played-games"],
    club: cells["team-name"],
    goals: num(cells["action-count"]),
  }));
  if (!rows.length || rows.some((row) => !row.name || !row.club || !Number.isInteger(row.goals) || row.goals < 0)) {
    throw new Error("top-scorer rows did not parse — the site markup may have changed");
  }
  return rows;
}

// Validate the invariants the unit tests enforce, flag our club row, and
// canonicalise the order (published order already satisfies it; a future
// tie-break the tests don't model gets sorted rather than shipped red).
function canonicalise(rows) {
  if (rows.length < 8) throw new Error(`only ${rows.length} rows parsed — a full division is expected`);
  for (const row of rows) {
    if (row.p !== row.w + row.d + row.l) throw new Error(`${row.team}: P (${row.p}) ≠ W+D+L — inspect the published table by hand`);
    if (row.pts !== row.w * 3 + row.d) throw new Error(`${row.team}: points (${row.pts}) ≠ 3×W+D — a deduction? handle this table by hand`);
  }
  const us = rows.filter((row) => US.test(row.team));
  if (us.length !== 1) throw new Error(`expected exactly one YCAC Pulse row, found ${us.length}`);
  us[0].us = true;
  const sorted = [...rows].sort((a, b) => (b.pts - a.pts) || ((b.gf - b.ga) - (a.gf - a.ga)) || a.team.localeCompare(b.team));
  const published = rows.map((row) => row.team).join(" > ");
  const canonical = sorted.map((row) => row.team).join(" > ");
  if (published !== canonical) console.log(`note: published order adjusted to points-then-GD to match the shipped contract`);
  return sorted;
}

// The shipped module, byte-compatible with the hand-written original.
function renderFile({ updated, rows, topScorers }) {
  const row = (r) => `      { team: ${JSON.stringify(r.team)}, p: ${r.p}, w: ${r.w}, d: ${r.d}, l: ${r.l}, gf: ${r.gf}, ga: ${r.ga}, pts: ${r.pts}${r.us ? ", us: true" : ""} },`;
  const scorer = (s) => `      { name: ${JSON.stringify(s.name)}, club: ${JSON.stringify(s.club)}, goals: ${s.goals} },`;
  return `/* YC&AC Pulse — TML Division 3 standings + league top scorers.
   GENERATED by \`npm run update:standings\` (update-standings.cjs) from the
   competition's published page (footyjapancompetitions.com/standings) — run it
   after each round completes instead of editing by hand; it re-validates what
   the unit tests enforce (P = W+D+L, 3-1-0 points, points-then-GD order, one
   us row) before writing. Goal difference is never stored: the renderer
   derives gf − ga so it cannot drift. The club row carries \`us: true\` and
   renders highlighted on the index; topScorers is the published D3 list. */
(() => {
  const standings = {
    competition: ${JSON.stringify(COMPETITION)},
    updated: "${updated}",
    rows: [
${rows.map(row).join("\n")}
    ],
    topScorers: [
${topScorers.map(scorer).join("\n")}
    ],
  };
  if (typeof module !== "undefined" && module.exports) module.exports = standings;
  if (typeof window !== "undefined") window.YCACStandings = standings;
})();
`;
}

function todayISO() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function diff(previous, rows, topScorers) {
  const old = new Map((previous && previous.rows ? previous.rows : []).map((row) => [row.team, row]));
  const changes = [];
  for (const row of rows) {
    const before = old.get(row.team);
    if (!before) changes.push(`  + ${row.team} joins the table at ${row.pts} pts`);
    else if (before.pts !== row.pts || before.p !== row.p || before.gf !== row.gf || before.ga !== row.ga) {
      changes.push(`  ${row.team}: ${before.p}P ${before.pts}pts → ${row.p}P ${row.pts}pts (${before.gf}-${before.ga} → ${row.gf}-${row.ga})`);
    }
    old.delete(row.team);
  }
  for (const gone of old.keys()) changes.push(`  - ${gone} is gone from the published table`);
  const oldScorers = new Map((previous && previous.topScorers ? previous.topScorers : []).map((row) => [row.name, row.goals]));
  for (const s of topScorers) {
    const before = oldScorers.get(s.name);
    if (before == null) changes.push(`  + top scorer ${s.name} (${s.club}) on ${s.goals}`);
    else if (before !== s.goals) changes.push(`  ${s.name}: ${before} → ${s.goals} goals`);
  }
  return changes;
}

async function build({ fetchImpl = fetch } = {}) {
  const res = await fetchImpl(PAGE_URL, { headers: { "user-agent": "ycac-pulse updater (update-standings.cjs)" } });
  if (!res.ok) throw new Error(`fetching ${PAGE_URL} failed: HTTP ${res.status}`);
  const html = await res.text();
  const rows = canonicalise(parseStandings(html));
  const topScorers = parseTopScorers(html);
  return { rows, topScorers, updated: todayISO() };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const previous = require(TARGET);
  const { rows, topScorers, updated } = await build();
  const changes = diff(previous, rows, topScorers);

  console.log(`update:standings — ${PAGE_URL}`);
  console.log(`  division rows: ${rows.length} (us: ${rows.find((row) => row.us).team} ${rows.find((row) => row.us).pts} pts)`);
  console.log(`  top scorers:   ${topScorers.map((row) => `${row.name} ${row.goals}`).join(", ")}`);
  console.log(`  table as of:   ${updated}`);
  if (changes.length) { console.log("  changes:"); for (const line of changes) console.log(line); }
  else console.log("  changes: none since the last update");

  if (dryRun) { console.log("dry run — standings.js not written"); return; }
  fs.writeFileSync(TARGET, renderFile({ updated, rows, topScorers }));
  console.log(`standings.js rewritten (${rows.length} rows, ${topScorers.length} scorers) — commit it to publish`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`update:standings failed — ${error.message}`);
    process.exit(1);
  });
}

module.exports = { parseStandings, parseTopScorers, canonicalise, renderFile, todayISO, diff };
