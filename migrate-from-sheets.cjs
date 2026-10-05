/* YC&AC Pulse — one-time migration: Google Sheets → Supabase (Phase 1).
   The sheets are read one last time, validated, and imported. After a clean
   report, set both sheets to read-only (see README).

   Usage:
     node migrate-from-sheets.cjs --dry-run     validate + report, writes nothing
     node migrate-from-sheets.cjs               import (needs credentials)

   Credentials (the secret key must never reach the browser — this script is
   the only place it is used; found in Project Settings → API Keys).
   Easiest: fill in the local .env file (git-ignored), then just run the script.
   Or set the environment yourself:
     $env:SUPABASE_URL = "https://xxxx.supabase.co"
     $env:SUPABASE_SERVICE_ROLE_KEY = "sb_secret_..."   (or legacy "eyJ..." service_role)
   or: node migrate-from-sheets.cjs --url https://xxxx.supabase.co --key sb_secret_...

   Re-runnable: tables with a primary key are upserted; goals and saved_squads
   (which have no natural key) are replaced for the matches being imported. */

const fs = require("fs");
const path = require("path");

const MAIN_SHEET_ID = "1KpxZeFlFUKIxTxB6_4_MgcdBAqi6He44aSW-0P4SPcM";
const PICKER_SHEET_ID = "17-4lv4pPgMdaMpYnOP-KL948j5WI2zK0BFUnW7Rw6MQ";

const warnings = [];
const skipped = [];
const note = (message) => { if (!warnings.includes(message)) warnings.push(message); };

// ---------------------------------------------------------------------------
// Google Sheets reading (gviz, same as the site does today)
// ---------------------------------------------------------------------------
async function grab(sheetId, tab) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?sheet=${encodeURIComponent(tab)}&tqx=out:json`;
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

// ---------------------------------------------------------------------------
// Normalisers — sheet cells are loosely typed, Postgres is not
// ---------------------------------------------------------------------------
const slug = (value) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
const toInt = (value) => (value === "" || value == null ? null : Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : null);
const toBool = (value) => value === true || String(value).toLowerCase() === "true";
const isoDate = (value) => {
  if (value == null || value === "") return null;
  const text = String(value);
  const match = text.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})\)/);
  if (match) return `${match[1]}-${String(Number(match[2]) + 1).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`;
  return text.slice(0, 10);
};
const isoDateTime = (value) => { const date = isoDate(value); return date ? `${date}T00:00:00Z` : null; };
const competitionOf = (value) => {
  const text = String(value ?? "").trim();
  if (text === "TML Division 3" || /tml/i.test(text)) return "TML Division 3";
  if (text === "Friendly Match" || /friendly/i.test(text)) return "Friendly Match";
  return null;
};
const roleOf = (value) => { const text = String(value ?? "").toLowerCase(); return text === "starter" || text === "start" ? "starter" : text.startsWith("sub") || text === "bench" ? "sub" : null; };
const signupOf = (value) => {
  const text = String(value ?? "").toLowerCase().trim();
  if (["confirmed", "waitlist", "declined", "unavailable"].includes(text)) return text;
  if (["out", "no", "n/a"].includes(text)) return "unavailable";
  return null;
};
const keep = (table, reason, row) => skipped.push(`${table}: ${reason} (${JSON.stringify(row)})`);

const idMap = new Map(); // raw player_id -> slug, applied to every reference
const ref = (value) => idMap.get(String(value ?? "").trim()) ?? slug(value);

// ---------------------------------------------------------------------------
// Table mapping
// ---------------------------------------------------------------------------
function mapAll({ players, matches, appearances, goals, signups, eventSignups, savedSquads }) {
  const mappedPlayers = players.map((row) => {
    const raw = String(row.player_id ?? "").trim();
    const id = slug(raw);
    if (raw && raw !== id) idMap.set(raw, id);
    if (!id) { keep("players", "missing player_id", row); return null; }
    return {
      id,
      display_name: String(row.display_name ?? "").trim() || id,
      display_name_full: null,
      nickname: null,
      shirt_number: toInt(row.shirt_number),
      primary_position: String(row.primary_position ?? "").trim() || null,
      secondary_positions: [],
      preferred_foot: null,
      photo_path: null,
      bio: null,
      active: row.active === "" || row.active == null ? true : toBool(row.active),
    };
  }).filter(Boolean);

  const seen = new Map();
  for (const player of mappedPlayers) {
    if (seen.has(player.id)) note(`duplicate player_id "${player.id}" — later row ignored`);
    seen.set(player.id, true);
  }
  const byId = new Map(mappedPlayers.map((player) => [player.id, player]));

  const mappedMatches = matches.map((row) => {
    const id = slug(row.match_id);
    const competition = competitionOf(row.competition);
    if (!id) { keep("matches", "missing match_id", row); return null; }
    if (!competition) { keep("matches", `unknown competition "${row.competition}"`, row); return null; }
    if (!row.opponent) { keep("matches", "missing opponent", row); return null; }
    const homeAway = String(row.home_away ?? "").toLowerCase();
    return {
      id,
      date: isoDate(row.date),
      competition,
      opponent: String(row.opponent).trim(),
      venue: String(row.venue ?? "").trim() || null,
      home_away: homeAway === "home" || homeAway === "away" ? homeAway : null,
      ycac_goals: toInt(row.ycac_goals),
      opponent_goals: toInt(row.opponent_goals),
      kickoff: String(row.kickoff ?? "").trim() || null,
      standard_signup_url: String(row.standard_signup_url ?? "").trim() || null,
      priority_signup_url: String(row.priority_signup_url ?? "").trim() || null,
    };
  }).filter(Boolean);
  const matchIds = new Set(mappedMatches.map((match) => match.id));

  const mappedAppearances = appearances.map((row) => {
    const match_id = slug(row.match_id), player_id = ref(row.player_id), role = roleOf(row.role);
    if (!matchIds.has(match_id)) { keep("appearances", `unknown match "${row.match_id}"`, row); return null; }
    if (!byId.has(player_id)) { keep("appearances", `unknown player "${row.player_id}"`, row); return null; }
    if (!role) { keep("appearances", `unknown role "${row.role}"`, row); return null; }
    return { match_id, player_id, role, position: String(row.position ?? "").trim() || null, minutes: toInt(row.minutes) };
  }).filter(Boolean);

  const mappedGoals = goals.map((row) => {
    const match_id = slug(row.match_id), scorer_id = ref(row.scorer_id);
    if (!matchIds.has(match_id)) { keep("goals", `unknown match "${row.match_id}"`, row); return null; }
    if (!byId.has(scorer_id)) { keep("goals", `unknown scorer "${row.scorer_id}"`, row); return null; }
    const assist_id = row.assist_player_id ? ref(row.assist_player_id) : null;
    if (assist_id && !byId.has(assist_id)) { note(`goal assist by unknown player "${row.assist_player_id}" — imported without assist`); return { match_id, scorer_id, assist_id: null, minute: toInt(row.minute) }; }
    return { match_id, scorer_id, assist_id, minute: toInt(row.minute) };
  }).filter(Boolean);

  // Signups live in two sheets today (Signups + EventSignups) — merge into one table.
  const mergedSignups = new Map();
  for (const row of [...eventSignups, ...signups]) {
    const match_id = slug(row.match_id), player_id = ref(row.player_id), status = signupOf(row.status);
    if (!matchIds.has(match_id)) { keep("signups", `unknown match "${row.match_id}"`, row); continue; }
    if (!byId.has(player_id)) { keep("signups", `unknown player "${row.player_id}"`, row); continue; }
    if (!status) { keep("signups", `unknown status "${row.status}"`, row); continue; }
    const key = `${match_id}:${player_id}`;
    if (!mergedSignups.has(key) || row.status === "confirmed") mergedSignups.set(key, { match_id, player_id, status, responded_at: null });
  }
  const mappedSignups = [...mergedSignups.values()];

  const mappedSquads = savedSquads.map((row) => {
    const match_id = slug(row.match_id), player_id = ref(row.player_id);
    const selection_type = roleOf(row.selection_type);
    if (!matchIds.has(match_id)) { keep("saved_squads", `unknown match "${row.match_id}"`, row); return null; }
    if (!byId.has(player_id)) { keep("saved_squads", `unknown player "${row.player_id}"`, row); return null; }
    if (!selection_type) { keep("saved_squads", `unknown selection_type "${row.selection_type}"`, row); return null; }
    return {
      saved_squad_id: String(row.saved_squad_id ?? "").trim() || `squad_${match_id}`,
      match_id,
      formation: String(row.formation ?? "4231"),
      player_id,
      selection_type,
      slot_order: toInt(row.slot_order) ?? 0,
      saved_at: isoDateTime(row.saved_at) ?? new Date().toISOString(),
      saved_by: String(row.saved_by ?? "").trim() || null,
      active: toBool(row.active),
    };
  }).filter(Boolean);

  // Data-quality warnings worth seeing before the import is trusted.
  const shirts = new Map();
  for (const player of mappedPlayers) {
    if (player.shirt_number == null) continue;
    shirts.set(player.shirt_number, [...(shirts.get(player.shirt_number) || []), player.display_name]);
  }
  for (const [number, names] of shirts) if (names.length > 1) note(`duplicate shirt #${number}: ${names.join(", ")}`);
  const seconds = mappedAppearances.filter((app) => app.role === "starter").reduce((map, app) => map.set(app.match_id, (map.get(app.match_id) || 0) + 1), new Map());
  for (const [match, count] of seconds) if (count > 11) note(`match ${match} has ${count} starters (expected 11)`);
  const playedWithoutGoals = mappedMatches.filter((match) => match.ycac_goals != null && match.ycac_goals > 0 && !mappedGoals.some((goal) => goal.match_id === match.id));
  for (const match of playedWithoutGoals) note(`match ${match.id} finished ${match.ycac_goals}-${match.opponent_goals} but has no goals logged`);

  return [
    { table: "players", rows: mappedPlayers, key: "on_conflict=id" },
    { table: "matches", rows: mappedMatches, key: "on_conflict=id" },
    { table: "appearances", rows: mappedAppearances, key: "on_conflict=match_id,player_id" },
    { table: "signups", rows: mappedSignups, key: "on_conflict=match_id,player_id" },
    { table: "goals", rows: mappedGoals, replace: [...matchIds] },
    { table: "saved_squads", rows: mappedSquads, replace: [...matchIds] },
  ];
}

// ---------------------------------------------------------------------------
// Supabase REST (PostgREST) — no SDK needed
// ---------------------------------------------------------------------------
async function rest(baseUrl, key, method, path, body) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
}

// Local credentials: a .env file next to this script (git-ignored — see .gitignore).
// Precedence: --flags > real environment variables > .env.
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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const flag = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
  loadLocalEnv();
  const baseUrl = flag("--url") || process.env.SUPABASE_URL;
  const serviceKey = flag("--key") || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!dryRun && (!baseUrl || !serviceKey)) {
    console.error("Missing credentials. Put SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the local .env file (see the template), or set the env vars / pass --url --key. (Use --dry-run to validate without writing.)");
    process.exit(1);
  }

  console.log(`YC&AC Pulse — Sheets → Supabase migration (${dryRun ? "DRY RUN, nothing will be written" : "IMPORT"})\n`);

  const [players, matches, appearances, goals, signups, eventSignups, savedSquads] = await Promise.all([
    grab(MAIN_SHEET_ID, "Players"), grab(MAIN_SHEET_ID, "Matches"), grab(MAIN_SHEET_ID, "Appearances"),
    grab(MAIN_SHEET_ID, "Goals"), grab(MAIN_SHEET_ID, "Signups"),
    grab(PICKER_SHEET_ID, "EventSignups"), grab(PICKER_SHEET_ID, "SavedSquads"),
  ]);

  const tables = mapAll({ players, matches, appearances, goals, signups, eventSignups, savedSquads });

  const width = Math.max(...tables.map((entry) => entry.table.length));
  console.log(`${"TABLE".padEnd(width)}  READ   IMPORT  SKIPPED`);
  const counts = { Players: players.length, Matches: matches.length, Appearances: appearances.length, Goals: goals.length, SavedSquads: savedSquads.length };
  const signupKeys = new Set([...eventSignups, ...signups].map((row) => `${slug(row.match_id)}:${ref(row.player_id)}`));
  counts.Signups = signupKeys.size;
  const signupTotal = signups.length + eventSignups.length;
  if (signupKeys.size < signupTotal) note(`${signupTotal - signupKeys.size} duplicate signup rows merged from the Signups and EventSignups sheets`);
  for (const entry of tables) {
    const read = { players: counts.Players, matches: counts.Matches, appearances: counts.Appearances, goals: counts.Goals, signups: counts.Signups, saved_squads: counts.SavedSquads }[entry.table];
    console.log(`${entry.table.padEnd(width)}  ${String(read).padEnd(6)} ${String(entry.rows.length).padEnd(7)} ${read - entry.rows.length}`);
  }

  if (warnings.length) { console.log("\nWarnings:"); warnings.forEach((message) => console.log(`  - ${message}`)); }
  if (skipped.length) { console.log(`\nSkipped rows (${skipped.length}):`); skipped.forEach((message) => console.log(`  - ${message}`)); }
  if (!warnings.length && !skipped.length) console.log("\nNo warnings, no skipped rows.");

  if (dryRun) {
    console.log("\nDry run complete — no data written. Run again without --dry-run to import.");
    process.exit(skipped.length ? 1 : 0);
  }

  console.log("\nImporting...");
  for (const entry of tables) {
    if (entry.replace?.length) {
      for (let index = 0; index < entry.replace.length; index += 50) {
        const batch = entry.replace.slice(index, index + 50);
        await rest(baseUrl, serviceKey, "DELETE", `${entry.table}?match_id=in.(${batch.join(",")})`);
      }
    }
    if (!entry.rows.length) { console.log(`  ${entry.table}: 0 rows`); continue; }
    for (let index = 0; index < entry.rows.length; index += 200) {
      await rest(baseUrl, serviceKey, "POST", `${entry.table}${entry.key ? `?${entry.key}` : ""}`, entry.rows.slice(index, index + 200));
    }
    console.log(`  ${entry.table}: ${entry.rows.length} rows`);
  }

  console.log(`\nImport complete. Next steps:`);
  console.log(`  1. Spot-check the data in the Supabase table editor.`);
  console.log(`  2. Set both Google Sheets to File → Share → Anyone with the link → Viewer (read-only archive).`);
  console.log(`  3. Create your coach login: Authentication → Users → Add user.`);
}

main().catch((error) => { console.error(`\nMigration failed: ${error.message}`); process.exit(1); });
