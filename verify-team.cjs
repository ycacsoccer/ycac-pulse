// Data-path check for the team page (team.html + team.js):
//   node verify-team.cjs
// Captures the current team_content rows, inserts probe rows for any of the
// three slugs the coach hasn't written yet (secret key), then signs in an
// ephemeral TEAM user and runs the page's exact query. Asserts: anon still
// sees 0 rows (page must gate), all three slugs resolve in admin order with
// titles/bodies passed through exactly as written (no translation mangling),
// then removes the probes and the user — restoring the original state.
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
  return { url: grab("supabaseUrl"), publishable: grab("supabaseAnonKey") };
};

const env = readEnv();
const config = readConfig();
const BASE = `${env.SUPABASE_URL}/rest/v1`;
const AUTH = `${env.SUPABASE_URL}/auth/v1`;
const secret = env.SUPABASE_SERVICE_ROLE_KEY;
const publishable = config.publishable;

const adminHeaders = { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
const anonHeaders = { apikey: publishable, Authorization: `Bearer ${publishable}`, "Content-Type": "application/json" };
const bearerHeaders = (token) => ({ apikey: publishable, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

const TEAM_EMAIL = "e2e-team-page@ycac-pulse.test";
const E2E_PASSWORD = "E2e-Verify-2026!";
// The same order team.js renders (SLUGS in team.js must match this).
const SLUGS = ["guidelines", "coach-instructions", "club-info"];
const PROBE_TITLE = "E2E probe title — as written";
const PROBE_BODY = "Line one, exactly as written.\n\nLine two & <not> translated — 改行もそのまま。";

const failures = [];
const check = (ok, label, detail = "") => {
  if (!ok) failures.push(label);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function call(url, { method = "GET", headers = {}, body } = {}) {
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (error) { data = text; }
  if (!response.ok) throw new Error(`${method} ${url} → ${response.status}: ${text.slice(0, 200)}`);
  return data;
}

const signIn = (email) => call(`${AUTH}/token?grant_type=password`, { method: "POST", headers: anonHeaders, body: { email, password: E2E_PASSWORD } });

async function main() {
  if (!secret || !publishable) throw new Error("missing credentials (.env / config.js)");
  console.log(`Verifying team page against ${env.SUPABASE_URL}\n`);

  const state = { teamUserId: null, inserted: [] };
  let baseline = null;

  try {
    // --- 1. capture the baseline (what the coach has written) -------------
    baseline = await call(`${BASE}/team_content?select=*&order=slug`, { headers: adminHeaders });
    check(Array.isArray(baseline), "baseline team_content read with secret key", `${baseline.length} rows`);

    // --- 2. probe rows for slugs that don't exist yet ---------------------
    for (const slug of SLUGS) {
      if (!baseline.some((row) => row.slug === slug)) {
        await call(`${BASE}/team_content`, { method: "POST", headers: adminHeaders, body: [{ slug, title: PROBE_TITLE, body: PROBE_BODY }] });
        state.inserted.push(slug);
      }
    }
    check(true, "probe content written for missing slugs", state.inserted.length ? `inserted: ${state.inserted.join(", ")}` : "baseline already complete");

    // --- 3. anon is gated out while content exists ------------------------
    const anonRows = await call(`${BASE}/team_content?select=*`, { headers: anonHeaders });
    check(anonRows.length === 0, "anon sees 0 team_content rows (page must gate on login)", `${anonRows.length}`);

    // --- 4. ephemeral team user — the page's own gate ---------------------
    const existing = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
    for (const user of existing.users || []) {
      if (user.email === TEAM_EMAIL) await call(`${AUTH}/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders });
    }
    const created = await call(`${AUTH}/admin/users`, { method: "POST", headers: adminHeaders, body: { email: TEAM_EMAIL, password: E2E_PASSWORD, email_confirm: true } });
    state.teamUserId = created.id;
    const token = (await signIn(TEAM_EMAIL)).access_token;
    check(Boolean(token), "password grant (team session)");

    // --- 5. the page's exact query ---------------------------------------
    const rows = await call(`${BASE}/team_content?select=*`, { headers: bearerHeaders(token) });
    check(rows.length >= 3, "team session reads team_content", `${rows.length} rows`);

    // --- 6. simulate team.js render: slug order + text as written ---------
    const blocks = SLUGS
      .map((slug) => rows.find((row) => row.slug === slug))
      .filter((row) => row && (row.title || row.body));
    check(blocks.length === 3, "every slug resolves in admin order", `${blocks.length}/3 sections`);
    const order = blocks.map((row) => row.slug).join(" →");
    check(order === SLUGS.join(" →"), "sections render in the SLUGS order", order);
    const shapeOk = blocks.every((row) => typeof row.title === "string" && typeof row.body === "string" && row.title.trim());
    check(shapeOk, "every section carries a title + body", blocks.map((row) => `${row.slug}:${row.title.length}t/${row.body.length}b`).join(" "));
    const probeBlock = blocks.find((row) => state.inserted.includes(row.slug));
    check(!probeBlock || (probeBlock.title === PROBE_TITLE && probeBlock.body === PROBE_BODY),
      "authored text passes through exactly as written (no translation)", probeBlock ? "probe text byte-identical" : "no probes to compare");
    const missing = blocks.filter((row) => row.updated_at && typeof row.updated_at !== "string");
    check(missing.length === 0, "updated_at arrives as a string for the meta line", `${blocks.filter((row) => row.updated_at).length} with meta`);

    // --- 7. static contract ------------------------------------------------
    const page = fs.readFileSync(path.join(__dirname, "team.html"), "utf8");
    const source = fs.readFileSync(path.join(__dirname, "team.js"), "utf8");
    check(source.includes("requireTeam"), "team.js gates the page behind requireTeam()");
    check(page.includes('name="robots" content="noindex'), "team.html is noindexed (team-only page)");
    check(page.includes("data-i18n-title=\"teamTitle\"") && source.includes('"contentGuidelines"'), "page + slug labels flow through i18n keys");
  } finally {
    // --- restore: remove only what this run inserted ----------------------
    for (const slug of state.inserted) {
      await call(`${BASE}/team_content?slug=eq.${slug}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
    if (state.teamUserId) {
      await call(`${AUTH}/admin/users/${state.teamUserId}`, { method: "DELETE", headers: adminHeaders }).catch(() => {});
    }
  }

  // --- post-cleanup ---------------------------------------------------------
  const after = await call(`${BASE}/team_content?select=slug`, { headers: adminHeaders });
  check(after.length === (baseline?.length ?? 0) && state.inserted.every((slug) => !after.some((row) => row.slug === slug)),
    "team_content restored to baseline", `${after.length} rows`);
  const users = await call(`${AUTH}/admin/users`, { headers: adminHeaders });
  check(!(users.users || []).some((user) => user.email === TEAM_EMAIL), "ephemeral team user deleted");
  const roster = await call(`${BASE}/coach_roster?select=email`, { headers: adminHeaders });
  check(roster.length === 1, "coach_roster untouched", roster.map((row) => row.email).join(", "));

  console.log("");
  if (failures.length) {
    console.log(`${failures.length} FAILURE(S): ${failures.join(" | ")}`);
    process.exit(1);
  }
  console.log("Team page verified: gating, slug order, authored text passthrough, cleanup.");
}

main().catch((error) => { console.error(`ERROR ${error.message}`); process.exit(1); });
