// Verifies the Supabase import and the access model: node verify-import.cjs
// Reads credentials from the local .env (secret, server-side only) and config.js (publishable).
// 1. counts are at least the 07 Oct 2026 import snapshot — the site has been
//    live-editing since (players, fixtures, signups, squads), so rows only grow;
//    a shrink means a lost row
// 2. match split: TML / friendly / pending
// 3. auth users + coach roster (who can write)
// 4. access model with real data (wave 33): anon sees EXACTLY what the secret
//    key sees on every site table; only coach_roster stays locked
const fs = require("fs");
const path = require("path");

const readEnv = () => Object.fromEntries(
  fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].trim().replace(/^["'](.*)["']$/, "$1").trim()]),
);
const readConfig = () => {
  const source = fs.readFileSync(path.join(__dirname, "config.js"), "utf8");
  const grab = (key) => source.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] || "";
  return { url: grab("supabaseUrl"), publishable: grab("supabaseAnonKey"), teamEmail: grab("teamEmail") };
};

const env = readEnv();
const config = readConfig();
const BASE = `${env.SUPABASE_URL}/rest/v1`;
const secret = env.SUPABASE_SERVICE_ROLE_KEY;
const anonHeaders = { apikey: config.publishable, Authorization: `Bearer ${config.publishable}`, Prefer: "count=exact" };
const adminHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, Prefer: "count=exact" };

const failures = [];
const check = (ok, label, detail = "") => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function count(table, headers) {
  const res = await fetch(`${BASE}/${table}?select=*`, { headers });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  const range = res.headers.get("content-range"); // "0-42/43"
  return Number(range?.split("/")[1] ?? "NaN");
}

async function main() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !config.publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying ${env.SUPABASE_URL}\n`);

  // --- 1. counts (read with the secret key: ground truth) --------------------
  // The import snapshot is a floor: live editing only grows these tables.
  const floor = {
    players: 40, matches: 13, appearances: 165, goals: 42, signups: 60, saved_squads: 70,
  };
  const got = {};
  for (const [table, want] of Object.entries(floor)) {
    got[table] = await count(table, adminHeaders);
    check(got[table] >= want, `${table} rows ≥ import snapshot`, `${got[table]}${got[table] === want ? "" : ` (imported ${want})`}`);
  }
  for (const table of ["match_notes", "team_content", "coach_notes", "coach_roster"]) {
    got[table] = await count(table, adminHeaders);
  }
  check(got.coach_roster === 1, "coach_roster rows", `${got.coach_roster}`);

  // --- 2. match split --------------------------------------------------------
  const matches = await (await fetch(`${BASE}/matches?select=date,competition,ycac_goals&order=date`, { headers: adminHeaders })).json();
  const tml = matches.filter((m) => m.competition === "TML Division 3").length;
  const friendly = matches.filter((m) => m.competition === "Friendly Match").length;
  const pending = matches.filter((m) => m.ycac_goals === null).length;
  const played = matches.filter((m) => m.ycac_goals !== null).length;
  check(tml >= 6 && friendly >= 7 && tml + friendly === got.matches,
    "match split covers every fixture with a known competition",
    `${tml} TML (${played - friendly} played + ${pending} pending), ${friendly} friendly, ${got.matches} total`);

  // --- 3. who can write ------------------------------------------------------
  const roster = await (await fetch(`${BASE}/coach_roster?select=email`, { headers: adminHeaders })).json();
  check(roster.length >= 1 && roster.every((row) => row.email), "coach_roster", roster.map((r) => r.email).join(", "));
  check(!roster.some((row) => row.email === config.teamEmail), "team account is NOT rostered (is_coach() → false for it)", config.teamEmail);

  const users = await (await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, { headers: adminHeaders })).json();
  const emails = (users.users || []).map((u) => u.email);
  check(emails.includes(config.teamEmail), "team account exists (config.teamEmail)", config.teamEmail);
  check(emails.length >= 2, "two auth users (team + coach)", emails.join(", "));
  const coachIsRostered = roster.some((row) => emails.includes(row.email));
  check(coachIsRostered, "a rostered email matches an auth user (writes will work)");

  // --- 4. access model with real data present (wave 33: everything open) -----
  const anonSee = async (table) => {
    const res = await fetch(`${BASE}/${table}?select=*`, { headers: { apikey: config.publishable, Authorization: `Bearer ${config.publishable}`, Prefer: "count=exact" } });
    const range = res.headers.get("content-range");
    return res.ok ? Number(range?.split("/")[1] ?? "NaN") : `error ${res.status}`;
  };
  for (const table of ["players", "appearances", "signups", "saved_squads", "match_notes", "team_content", "coach_notes"]) {
    const anon = await anonSee(table);
    check(anon === got[table], `anon sees every ${table} row (public since wave 33)`, `${anon} of ${got[table]}`);
  }
  check((await anonSee("coach_roster")) === 0, "anon sees 0 of 1 coach_roster rows (login bookkeeping stays locked)");

  // --- summary ---------------------------------------------------------------
  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Import verified: data, match split, access model — all good.");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
