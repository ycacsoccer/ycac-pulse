/* Supabase mock for the local E2E suite.
   Every request to the project's REST endpoint is intercepted with
   page.route() and answered from tests/fixtures/public-data.js, so the suite
   is deterministic: no credentials, no network, no dependence on whatever
   matches the coach has entered today.

   Anything that is NOT one of the five public tables (players, matches,
   appearances, goals, injuries) — team tables, rpc, storage — is rejected with
   401 and recorded in `denied`, which the specs assert is empty: the public
   pages must never ask for data the anon role cannot read. */
const { tables: fixtures } = require("../fixtures/public-data");

const PUBLIC_TABLES = new Set(Object.keys(fixtures));
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

  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    log.hosts.add(url.hostname);
    const tail = decodeURIComponent(url.pathname.split("/rest/v1/")[1] || "");
    log.rest.push(`${tail}${url.search}`);

    const table = tail.split("/")[0];
    if (options.coach && tail === "rpc/is_coach") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "true" });
    }
    if (options.coach && table === "signups") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (options.coach && table === "coach_notes") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (tail.startsWith("rpc/") || !PUBLIC_TABLES.has(table)) {
      log.denied.push(tail);
      return route.fulfill({ status: 401, contentType: "application/json", body: DENY_BODY });
    }

    log.requestedTables.push(table);
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
