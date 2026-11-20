/* Verifies stats.js against the data in Supabase — the engine's regression
   snapshot (Phase 12 rewired this off gviz; the whole suite now reads one
   source of truth). The EXPECTED block includes the 15 Nov 2026 Jetro result,
   but excludes the confirmed 31 Oct squad's appearances from baseline player
   totals so those appearances can be verified against the locked squad
   separately. The Jetro scorer is entered, but its appearances are not yet
   confirmed. Other live data changes still require a deliberate snapshot update.
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

async function grab(table, query = "select=*") {
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, { headers: anonHeaders });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return response.json();
}

const EXPECTED = {
  rows: { players: 43, matches: 17, appearances: 182, goals: 47 },
  counts: { all: 14, tml: 7, friendly: 7, players: 43, used: 36 },
  players: {
    rick: { tml: "5/7", friendly: "7/7", all: "12/14", tier: "core", reliability: 83 },
    urabe: { tml: "5/7", friendly: "7/7", all: "12/14", tier: "core" },
    hitoshi: { tml: "4/7", friendly: "6/7", all: "10/14", tier: "rotation" },
    // Core is TML-only (>= 67% of TML matches): friendly attendance never demotes.
    sun: { tml: "4/7", friendly: "2/7", all: "6/14", tier: "rotation" },
    kouhei: { tml: "3/7", friendly: "2/7", all: "5/14", tier: "rotation" },
    yuto: { tml: "0/7", friendly: "7/7", all: "7/14", tier: "rotation" },
    masashi: { tml: "5/7", friendly: "1/7", all: "6/14", tier: "core" },
    liu_hantang: { tml: "1/7", friendly: "0/7", all: "1/14", tier: "depth" }, // added 06 Oct (first TML appearance)
    ryuji: { tier: "inactive" },
    micah: { tier: "inactive" },
    ryuichi_shiba: { tml: "0/7", friendly: "0/7", all: "0/14", tier: "inactive" },
    ito_taiyo: { tml: "0/7", friendly: "0/7", all: "0/14", tier: "inactive" },
  },
};

const show = (stat, total) => `${stat}/${total}`;

async function main() {
  const [players, matches, appearances, goals] = await Promise.all(
    ["players", "matches", "appearances", "goals"].map((table) => grab(table)));
  const kilimanjaro = matches.find((match) => match.id === "m007");
  const jetro = matches.find((match) => match.id === "m008");
  const bfcFixture = matches.find((match) => match.id === "m010");
  const vottyFixture = matches.find((match) => match.id === "m011");
  const confirmed = Boolean(kilimanjaro?.squad_confirmed_at);
  const matchApps = appearances.filter((row) => row.match_id === "m007");
  const baselineApps = confirmed ? appearances.filter((row) => row.match_id !== "m007") : appearances;
  const savedSquads = confirmed ? await grab("saved_squads", "select=*&match_id=eq.m007&active=eq.true") : [];

  // signups is a team-only table; the tier engine doesn't need it (tiers come
  // from appearances alone), so the public snapshot passes none.
  const season = YCACStats.computeSeason({ players, matches, appearances, goals });
  const baseline = confirmed ? YCACStats.computeSeason({ players, matches, appearances: baselineApps, goals }) : season;
  const byId = new Map(baseline.players.map((entry) => [entry.id, entry]));

  const checks = [];
  const check = (label, actual, expected) => checks.push({ label, actual, expected, ok: String(actual) === String(expected) });

  check("Players rows", players.length, EXPECTED.rows.players);
  check("Matches rows", matches.length, EXPECTED.rows.matches);
  check("Baseline appearances rows", baselineApps.length, EXPECTED.rows.appearances);
  check("Goals rows", goals.length, EXPECTED.rows.goals);
  check("Played matches", baseline.counts.matches.all, EXPECTED.counts.all);
  check("TML matches", baseline.counts.matches.tml, EXPECTED.counts.tml);
  check("Friendly matches", baseline.counts.matches.friendly, EXPECTED.counts.friendly);
  check("Players in squad", baseline.counts.players, EXPECTED.counts.players);
  check("Baseline players used", baseline.counts.used, EXPECTED.counts.used);
  check("31 Oct result", kilimanjaro ? `${kilimanjaro.ycac_goals}–${kilimanjaro.opponent_goals}` : "MISSING", "2–2");
  check("31 Oct scorers", goals.filter((goal) => goal.match_id === "m007").map((goal) => goal.scorer_id).sort().join(","), "masashi,ryu");
  check("15 Nov result", jetro ? `${jetro.ycac_goals}–${jetro.opponent_goals}` : "MISSING", "1–2");
  check("15 Nov scorer", goals.filter((goal) => goal.match_id === "m008").map((goal) => goal.scorer_id).sort().join(","), "ryoga");
  // The league listed this under "YC&AC" by mistake; the user confirmed Pulse.
  check("6 Dec fixture", bfcFixture ? `${bfcFixture.date}|${bfcFixture.opponent}|${bfcFixture.competition}|${bfcFixture.home_away}|${bfcFixture.kickoff}` : "MISSING",
    "2026-12-06|BFC Tokyo|TML Division 3|home|11:00");
  check("13 Dec fixture", vottyFixture ? `${vottyFixture.date}|${vottyFixture.opponent}|${vottyFixture.competition}|${vottyFixture.home_away}|${vottyFixture.kickoff}` : "MISSING",
    "2026-12-13|Votty SC|TML Division 3|home|11:00");
  if (confirmed) {
    const groups = new Set(savedSquads.map((row) => row.saved_squad_id));
    const picked = savedSquads.filter((row) => row.selection_type === "starter" || (row.selection_type === "sub" && row.played === true));
    const signature = (rows, roleKey) => rows.map((row) => `${row.player_id}:${row[roleKey]}`).sort().join(",");
    check("Confirmed squad groups", groups.size, 1);
    check("Confirmed starting XI", savedSquads.filter((row) => row.selection_type === "starter").length, 11);
    check("Confirmed appearances", signature(matchApps, "role"), signature(picked, "selection_type"));
    const actual = new Map(season.players.map((entry) => [entry.id, entry]));
    const pickedIds = new Set(picked.map((row) => row.player_id));
    for (const [id, entry] of byId) {
      check(`${id} confirmed-match contribution`, actual.get(id).competitions.tml.played,
        entry.competitions.tml.played + (pickedIds.has(id) ? 1 : 0));
    }
  }

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

  console.log(`\n${failed ? `${failed} CHECK(S) FAILED — data may have changed since the 15 Nov 2026 snapshot (bump EXPECTED deliberately)` : "All checks passed."}`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
