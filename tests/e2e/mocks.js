/* Supabase mock for the local E2E suite.
   Every request to the project's REST endpoint is intercepted with
   page.route() and answered from tests/fixtures/public-data.js, so the suite
   is deterministic: no credentials, no network, no dependence on whatever
   matches the coach has entered today.

   Since wave 33 every site table — including signups, match_notes,
   saved_squads, coach_notes and team_content — is publicly readable and
   writable (migration 0004_public_access.sql), so the mock answers them for
   everyone. Anything outside that set (coach_roster, unknown tables,
   rpc/is_coach without the coach flag) is rejected with 401 and recorded in
   `denied`, which the specs assert is empty: the public pages must never ask
   for data the anon role cannot read. */
const { tables: fixtures, signups: signupsFixture } = require("../fixtures/public-data");

const PUBLIC_TABLES = new Set([
  ...Object.keys(fixtures), // players, matches, appearances, goals, injuries
  "signups", "match_notes", "saved_squads", "coach_notes", "team_content",
]);
const DENY_BODY = JSON.stringify({ message: "E2E mock: request outside the public read set" });

const clone = (rows) => JSON.parse(JSON.stringify(rows));

/* `or=(scorer_id.eq.p-chr,assist_id.eq.p-chr)` → rows matching ANY clause. */
function applyOr(rows, expression) {
  const clauses = String(expression).replace(/^\(|\)$/g, "").split(",").map((clause) => {
    const [field, op, ...rest] = clause.split(".");
    return { field, op, value: rest.join(".") };
  }).filter((clause) => clause.field && clause.value);
  if (!clauses.length) return rows;
  return rows.filter((row) => clauses.some(({ field, op, value }) => (
    op === "eq" ? String(row[field]) === value
      : op === "neq" ? String(row[field]) !== value
        : op === "is.null" ? row[field] == null
          : false
  )));
}

async function mockSupabase(page, options = {}) {
  const log = { rest: [], requestedTables: [], denied: [], hosts: new Set() };
  // The signups store is mutable — edits stick for later reads in the same
  // test (wave 33: anyone may add / move / remove signups on the match page).
  const store = { signups: clone(signupsFixture) };

  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    log.hosts.add(url.hostname);
    const tail = decodeURIComponent(url.pathname.split("/rest/v1/")[1] || "");
    log.rest.push(`${tail}${url.search}`);

    const table = tail.split("/")[0];
    if (tail === "rpc/is_coach") {
      // is_coach() is EXECUTE'd only for authenticated accounts in Supabase;
      // only a post-login check asks for it (options.coach simulates that).
      if (options.coach) return route.fulfill({ status: 200, contentType: "application/json", body: "true" });
      log.denied.push(tail);
      return route.fulfill({ status: 401, contentType: "application/json", body: DENY_BODY });
    }
    if (!PUBLIC_TABLES.has(table)) { // coach_roster, unknown tables
      log.denied.push(tail);
      return route.fulfill({ status: 401, contentType: "application/json", body: DENY_BODY });
    }
    log.requestedTables.push(table);

    if (table === "signups") { // mutable — the match page's signup editor
      const method = route.request().method();
      const slice = () => store.signups.filter((row) => ["match_id", "player_id"].every((field) => {
        const filter = url.searchParams.get(field);
        return !filter || !filter.startsWith("eq.") || String(row[field]) === filter.slice(3);
      }));
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (method === "POST") {
        const body = route.request().postDataJSON() || [];
        const rows = Array.isArray(body) ? body : [body];
        rows.forEach((row) => {
          const existing = store.signups.find((signup) => signup.match_id === row.match_id && signup.player_id === row.player_id);
          if (existing) Object.assign(existing, row);
          else store.signups.push(row);
        });
        return json(201, rows);
      }
      if (method === "PATCH") {
        const patch = route.request().postDataJSON() || {};
        const targets = slice();
        targets.forEach((row) => Object.assign(row, patch));
        return json(200, targets);
      }
      if (method === "DELETE") {
        const targets = slice();
        store.signups = store.signups.filter((row) => !targets.includes(row));
        return json(200, targets);
      }
      let rows = slice();
      const select = url.searchParams.get("select") || "";
      if (select.includes("players(")) {
        rows = rows.map((row) => ({ ...row, players: fixtures.players.find((player) => player.id === row.player_id) ?? null }));
      }
      return json(200, rows);
    }
    if (table === "coach_notes" || table === "match_notes" || table === "saved_squads" || table === "team_content") {
      // no fixture rows for these — reads answer empty, writes acknowledge.
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }

    let rows = clone(fixtures[table]);

    // Common PostgREST equality filters used across public pages.
    for (const field of ["id", "match_id", "player_id"]) {
      const filter = url.searchParams.get(field);
      if (filter && filter.startsWith("eq.")) {
        const wanted = filter.slice(3);
        rows = rows.filter((row) => String(row[field]) === wanted);
      }
    }
    const or = url.searchParams.get("or");
    if (or) rows = applyOr(rows, or);

    const order = url.searchParams.get("order");
    if (order === "display_name") rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
    if (order === "date") rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // PostgREST embedding: `select=*,matches(date,opponent,…)` on a child row
    const select = url.searchParams.get("select") || "";
    if (select.includes("matches(")) {
      rows = rows.map((row) => ({ ...row, matches: fixtures.matches.find((match) => match.id === row.match_id) ?? null }));
    }
    if (select.includes("players(")) {
      rows = rows.map((row) => ({ ...row, players: fixtures.players.find((player) => player.id === row.player_id) ?? null }));
    }

    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
  });

  return log;
}

/* pageerror + console.error collector — a spec asserts it stays empty. */
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

/* The public pages must read from the project itself, never another host. */
function publicOnly(log) {
  return log.denied.length === 0
    && [...log.hosts].every((host) => host.endsWith(".supabase.co"))
    && log.requestedTables.every((table) => PUBLIC_TABLES.has(table));
}

/* No horizontal scrollbar: document fits the viewport (+1px tolerance). */
async function fitsViewport(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

module.exports = { mockSupabase, watchErrors, publicOnly, fitsViewport, PUBLIC_TABLES };
