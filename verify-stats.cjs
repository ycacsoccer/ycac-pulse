/* Verifies stats.js against the data in Supabase — the engine's regression
   snapshot (Phase 12 rewired this off gviz; the whole suite now reads one
   source of truth). The EXPECTED block is the import-time snapshot of
   06 Oct 2026 (BFC Tokyo result + lineup entered); if the database has
   moved on (new results entered, roster edits), mismatches are reported
   rather than silently accepted — bump the snapshot deliberately when that happens.
   Usage: node verify-stats.cjs */

const fs = require("fs");
const path = require("path");
const YCACStats = require("./stats.js");

const readConfig = () => {
  const source = fs.readFileSync(path.join(__dirname, "config.js"), "utf8");
  const grab = (key) => source.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] || "";
  return { url: grab("supabaseUrl"), publishable: grab("supabaseAnonKey") };
};
const config = readConfig();
const anonHeaders = { apikey: config.publishable, Authorization: `Bearer ${config.publishable}`, "Content-Type": "application/json" };

async function grab(table) {
  const response = await fetch(`${config.url}/rest/v1/${table}?select=*`, { headers: anonHeaders });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return response.json();
}

const EXPECTED = {
  rows: { players: 38, matches: 11, appearances: 165, goals: 42 },
  counts: { all: 11, tml: 4, friendly: 7, players: 38, used: 33 },
  players: {
    rick: { tml: "4/4", friendly: "7/7", all: "11/11", tier: "core", reliability: 100 },
    urabe: { tml: "4/4", friendly: "7/7", all: "11/11", tier: "core" },
    hitoshi: { tml: "4/4", friendly: "6/7", all: "10/11", tier: "core" },
    // Core is TML-only (>= 67% of TML matches): friendly attendance never demotes.
    sun: { tml: "3/4", friendly: "2/7", all: "5/11", tier: "core" },
    kouhei: { tml: "3/4", friendly: "2/7", all: "5/11", tier: "core" },
    yuto: { tml: "0/4", friendly: "7/7", all: "7/11", tier: "rotation" },
    masashi: { tml: "4/4", friendly: "1/7", all: "5/11", tier: "core" },
    liu_hantang: { tml: "1/4", friendly: "0/7", all: "1/11", tier: "depth" }, // added 06 Oct (first TML appearance)
    ryuji: { tier: "inactive" },
    micah: { tier: "inactive" },
  },
};

const show = (stat, total) => `${stat}/${total}`;

async function main() {
  const [players, matches, appearances, goals] = await Promise.all(
    ["players", "matches", "appearances", "goals"].map(grab));

  // signups is a team-only table; the tier engine doesn't need it (tiers come
  // from appearances alone), so the public snapshot passes none.
  const season = YCACStats.computeSeason({ players, matches, appearances, goals });
  const byId = new Map(season.players.map((entry) => [entry.id, entry]));

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
  const missingPhotos = players.filter((player) => !player.photo_path).length;

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
  console.log(`  ${missingPhotos} players with no photo yet (coach uploads from the profile page)`);
  console.log(`  ${appearances.filter((app) => !app.minutes).length}/${appearances.length} appearances missing minutes`);

  console.log(`\n${failed ? `${failed} CHECK(S) FAILED — data may have changed since the 06 Oct 2026 snapshot (bump EXPECTED deliberately)` : "All checks passed."}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
