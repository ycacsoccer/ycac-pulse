const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { build } = require("../../update-fixtures.cjs");
const root = path.resolve(__dirname, "../..");

for (const entry of ["update-fixtures.cjs", "update-standings.cjs"]) {
  test(`${entry} refreshes both feeds once; dry-run/no-sync never writes`, () => {
    const before = ["fixtures.js", "standings.js"].map((name) => fs.readFileSync(path.join(root, name), "utf8"));
    const source = `
      const fs = require('fs');
      process.argv.push('--dry-run', '--no-sync');
      const calls = [];
      global.fetch = async (url) => {
        calls.push(url);
        const file = url.includes('/standings') ? 'footy-standings-d3.html' : 'footy-fixtures-d3.html';
        if (!url.startsWith('https://www.footyjapancompetitions.com/')) throw Error('Unexpected database request');
        return { ok: true, text: async () => fs.readFileSync('tests/fixtures/' + file, 'utf8') };
      };
      require('./${entry}').main().then(() => console.log('FETCHES=' + JSON.stringify(calls))).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const child = spawnSync(process.execPath, ["-e", source], { cwd: root, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const calls = JSON.parse(child.stdout.match(/FETCHES=(.*)/)[1]);
    assert.equal(calls.filter((url) => url.includes("/standings")).length, 1);
    assert.equal(calls.filter((url) => url.includes("/fixtures-results")).length, 1);
    assert.match(child.stdout, /dry run — fixtures.js not written/);
    assert.deepEqual(["fixtures.js", "standings.js"].map((name) => fs.readFileSync(path.join(root, name), "utf8")), before);
  });
}

test("pagination beyond the safety cap refuses to silently truncate booking history", async () => {
  await assert.rejects(build({ fetchImpl: async () => ({ ok: true, text: async () => '<a href="?page=15">Last</a>' }) }), /losing booking history/);
});

for (const mode of ["dry-run", "write", "concurrent-edit"]) {
  test(`scoring API sync (${mode}) uses guarded updates and never touches a real backend`, () => {
    const source = `
      process.env.SUPABASE_URL = 'https://league-sync.test';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
      const calls = [];
      const match = { id: 'm001', date: '2026-10-17', competition: 'TML Division 3', opponent: 'Opponent', home_away: 'home', ycac_goals: null, opponent_goals: null };
      global.fetch = async (url, options = {}) => {
        if (!url.startsWith('https://league-sync.test/rest/v1/')) throw Error('Unexpected host');
        const method = options.method || 'GET';
        calls.push({ url, method, body: options.body ? JSON.parse(options.body) : null });
        let rows = [];
        if (method === 'GET' && url.includes('/matches?')) rows = [match];
        if (method === 'GET' && url.includes('/players?')) rows = [{ id: 'rick', display_name: 'Rick Li' }];
        if (method === 'PATCH') rows = ${JSON.stringify(mode)} === 'concurrent-edit' ? [] : [{ ...match, ycac_goals: 2, opponent_goals: 0 }];
        return { ok: true, json: async () => rows };
      };
      const feed = { fixtures: [], results: [{ date: match.date, home: 'YCAC Pulse', away: 'Opponent', hg: 2, ag: 0, scorers: { home: ['Rick Li', 'Rick Li'], away: [] } }] };
      require('./update-fixtures.cjs').sync(feed, { dryRun: ${mode === "dry-run"} }).then(() => console.log('REQUESTS=' + JSON.stringify(calls))).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const child = spawnSync(process.execPath, ["-e", source], { cwd: root, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const calls = JSON.parse(child.stdout.match(/REQUESTS=(.*)/)[1]);
    const writes = calls.filter((call) => call.method !== "GET");
    if (mode === "dry-run") assert.equal(writes.length, 0);
    else {
      assert.match(writes[0].url, /ycac_goals=is.null&opponent_goals=is.null/);
      assert.deepEqual(writes[0].body, { ycac_goals: 2, opponent_goals: 0 });
      if (mode === "concurrent-edit") assert.equal(writes.length, 1, "no goals after a failed compare-and-set");
      else { assert.equal(writes.length, 2); assert.equal(writes[1].body.length, 2); }
    }
  });
}
