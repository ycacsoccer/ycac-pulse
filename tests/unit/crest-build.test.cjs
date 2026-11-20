const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("the official crest is local, cache-busted and included in the published build", (t) => {
  const project = path.resolve(__dirname, "../..");
  const preferred = path.join(os.tmpdir(), "opencode");
  const sandbox = fs.mkdtempSync(path.join(fs.existsSync(preferred) ? preferred : os.tmpdir(), "ycac-crest-build-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  fs.mkdirSync(path.join(sandbox, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(sandbox, "media"), { recursive: true });
  fs.copyFileSync(path.join(project, "scripts", "build-site.js"), path.join(sandbox, "scripts", "build-site.js"));
  fs.copyFileSync(path.join(project, "media", "ycac-crest.png"), path.join(sandbox, "media", "ycac-crest.png"));
  const pages = ["index.html", "players.html", "player.html", "coach.html", "admin.html", "match.html", "team.html", "login.html"];
  for (const file of pages) fs.copyFileSync(path.join(project, file), path.join(sandbox, file));
  fs.writeFileSync(path.join(sandbox, "media", "unrelated.png"), "not publishable");
  execFileSync(process.execPath, [path.join(sandbox, "scripts", "build-site.js"), "--sha", "abcdef0123456789"], { cwd: sandbox, encoding: "utf8" });
  const original = fs.readFileSync(path.join(project, "media", "ycac-crest.png"));
  assert.deepEqual(original.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.deepEqual(fs.readFileSync(path.join(sandbox, "_site", "media", "ycac-crest.png")), original);
  assert.equal(fs.existsSync(path.join(sandbox, "_site", "media", "unrelated.png")), false);
  for (const file of pages) {
    const html = fs.readFileSync(path.join(sandbox, "_site", file), "utf8");
    assert.match(html, /rel="icon" href="media\/ycac-crest\.png\?v=abcdef0"/, file);
    assert.match(html, /class="club-mark"[^>]*><img src="media\/ycac-crest\.png\?v=abcdef0"/, file);
    assert.doesNotMatch(html, /ycac\.jp\/wp-content\/uploads\/2025\/10\/YCAC-Logo-Icon\.png/, file);
  }
  const index = fs.readFileSync(path.join(sandbox, "_site", "index.html"), "utf8");
  assert.match(index, /property="og:image" content="https:\/\/ycacsoccer\.github\.io\/ycac-pulse\/media\/ycac-crest\.png"/);
  assert.match(index, /name="twitter:image" content="https:\/\/ycacsoccer\.github\.io\/ycac-pulse\/media\/ycac-crest\.png"/);
});
