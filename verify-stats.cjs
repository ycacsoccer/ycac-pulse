/* Verifies stats.js against the live Google Sheet data — run before the migration
   (Phase 1) so we know the new engine reproduces the numbers we already trust.
   Usage: node verify-stats.cjs
   Note: EXPECTED is a snapshot of 05 Oct 2026. If the sheet has been updated
   since, mismatches are reported rather than silently accepted. */

const YCACStats = require("./stats.js");

const SHEET_ID = "1KpxZeFlFUKIxTxB6_4_MgcdBAqi6He44aSW-0P4SPcM";

async function grab(tab) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${encodeURIComponent(tab)}&tqx=out:json`;
  const text = await (await fetch(url)).text();
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  let headers = json.table.cols.map((column) => column.label);
  let rows = json.table.rows;
  if (headers.every((header) => !header) && rows.length) {
    headers = rows[0].c.map((cell) => cell?.v ?? "");
    rows = rows.slice(1);
  }
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row.c[index]?.v ?? ""])));
}

const EXPECTED = {
  rows: { players: 37, matches: 11, appearances: 149, goals: 42 },
  counts: { all: 10, tml: 3, friendly: 7, players: 37, used: 32 },
  players: {
    rick: { tml: "3/3", friendly: "7/7", all: "10/10", tier: "core", reliability: 100 },
    urabe: { tml: "3/3", friendly: "7/7", all: "10/10", tier: "core" },
    hitoshi: { tml: "3/3", friendly: "6/7", all: "9/10", tier: "core" },
    // Core is TML-only (>= 67% of TML matches): friendly attendance never demotes.
    sun: { tml: "3/3", friendly: "2/7", all: "5/10", tier: "core" },
    kouhei: { tml: "3/3", friendly: "2/7", all: "5/10", tier: "core" },
    yuto: { tml: "0/3", friendly: "7/7", all: "7/10", tier: "rotation" },
    masashi: { tml: "3/3", friendly: "1/7", all: "4/10", tier: "core" },
    ryuji: { tier: "inactive" },
    micah: { tier: "inactive" },
  },
};

const show = (stat, total) => `${stat}/${total}`;

async function main() {
  const [players, matches, appearances, goals, signups] = await Promise.all(
    ["Players", "Matches", "Appearances", "Goals", "Signups"].map(grab));

  const season = YCACStats.computeSeason({ players, matches, appearances, goals, signups });
  const byId = new Map(season.players.map((entry) => [entry.player_id, entry]));

  const checks = [];
  const check = (label, actual, expected) => checks.push({ label, actual, expected, ok: String(actual) === String(expected) });

  check("Players rows", players.length, EXPECTED.rows.players);
  check("Matches rows", matches.length, EXPECTED.rows.matches);
  check("Appearances rows", appearances.length, EXPECTED.rows.appearances);
  check("Goals rows", goals.length, EXPECTED.rows.goals);
  check("Played matches", season.counts.matches.all, EXPECTED.counts.all);
  check("TML matches", season.counts.matches.tml, EXPECTED.counts.tml);
  check("Friendly matches", season.counts.matches.friendly, EXPECTED.counts.friendly);
  check("Players in squad", season.counts.players, EXPECTED.counts.players);
  check("Players used", season.counts.used, EXPECTED.counts.used);

  for (const [id, expected] of Object.entries(EXPECTED.players)) {
    const entry = byId.get(id);
    if (!entry) { checks.push({ label: `${id} exists`, actual: "MISSING", expected: "present", ok: false }); continue; }
    const buckets = { tml: season.counts.matches.tml, friendly: season.counts.matches.friendly, all: season.counts.matches.all };
    for (const bucket of ["tml", "friendly", "all"]) {
      if (expected[bucket]) check(`${id} ${bucket}`, show(entry.competitions[bucket].played, buckets[bucket]), expected[bucket]);
    }
    if (expected.tier) check(`${id} tier`, entry.tier, expected.tier);
    if (expected.reliability != null) check(`${id} reliability`, entry.reliability, expected.reliability);
  }

  // Data-quality flags the coach dashboard will surface (reported, not fatal).
  const shirtNumbers = new Map();
  for (const player of players) {
    if (!player.shirt_number) continue;
    shirtNumbers.set(player.shirt_number, [...(shirtNumbers.get(player.shirt_number) || []), player.display_name]);
  }
  const duplicates = [...shirtNumbers.entries()].filter(([, names]) => names.length > 1);
  const missingPhotos = players.length; // no photo column exists yet

  console.log("\nYC&AC Pulse — stats engine verification\n");
  console.log(`Season: ${season.counts.matches.all} played (${season.counts.matches.tml} TML · ${season.counts.matches.friendly} friendly) · ${season.counts.matches.upcoming} upcoming`);
  console.log(`Squad: ${season.counts.players} players · ${season.counts.used} used\n`);

  const pad = (value, width) => String(value).padEnd(width);
  console.log(pad("TIER", 10) + pad("PLAYER", 12) + pad("POS", 6) + pad("TML", 7) + pad("FRIENDLY", 10) + pad("ALL", 8) + pad("REL", 5) + "GOALS");
  for (const tier of YCACStats.TIER_ORDER) {
    for (const entry of YCACStats.ranked(season.tiers[tier])) {
      console.log(
        pad(tier.toUpperCase(), 10) + pad(entry.display_name, 12) + pad(entry.position_group, 6) +
        pad(show(entry.competitions.tml.played, season.counts.matches.tml), 7) +
        pad(show(entry.competitions.friendly.played, season.counts.matches.friendly), 10) +
        pad(show(entry.competitions.all.played, season.counts.matches.all), 8) +
        pad(entry.reliability ?? "–", 5) + entry.competitions.all.goals);
    }
  }

  console.log("\nChecks:");
  let failed = 0;
  for (const item of checks) {
    if (!item.ok) failed += 1;
    console.log(`  ${item.ok ? "OK  " : "FAIL"} ${item.label}: ${item.actual}${item.ok ? "" : ` (expected ${item.expected})`}`);
  }

  console.log("\nData-quality flags:");
  console.log(`  ${duplicates.length ? duplicates.map(([no, names]) => `duplicate shirt #${no}: ${names.join(", ")}`).join("\n  ") : "no duplicate shirt numbers"}`);
  console.log(`  ${missingPhotos} players with no photo (photo column does not exist yet)`);
  console.log(`  ${appearances.filter((app) => !app.minutes).length}/${appearances.length} appearances missing minutes`);

  console.log(`\n${failed ? `${failed} CHECK(S) FAILED — sheet may have changed since 05 Oct 2026` : "All checks passed."}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
