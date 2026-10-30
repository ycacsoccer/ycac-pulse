const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("site build publishes only the intended standalone clips and posters", (t) => {
  const project = path.resolve(__dirname, "../..");
  const preferred = path.join(os.tmpdir(), "opencode");
  const sandbox = fs.mkdtempSync(path.join(fs.existsSync(preferred) ? preferred : os.tmpdir(), "ycac-tactics-build-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  fs.mkdirSync(path.join(sandbox, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(sandbox, "media", "tactical-foundation"), { recursive: true });
  fs.copyFileSync(path.join(project, "scripts", "build-site.js"), path.join(sandbox, "scripts", "build-site.js"));
  for (const file of ["tactical-foundation.html", "tactical-foundation.css"]) fs.copyFileSync(path.join(project, file), path.join(sandbox, file));
  for (const name of ["defensive-shape", "attacking-buildup"]) {
    for (const extension of ["mp4", "jpg"]) {
      const file = path.join("media", "tactical-foundation", `${name}.${extension}`);
      fs.copyFileSync(path.join(project, file), path.join(sandbox, file));
    }
  }
  fs.writeFileSync(path.join(sandbox, "media", "tactical-foundation", "unrelated.mp4"), "must not be published");
  fs.writeFileSync(path.join(sandbox, ".env"), "must not be published");
  execFileSync(process.execPath, [path.join(sandbox, "scripts", "build-site.js"), "--sha", "abcdef0123456789"], { cwd: sandbox, encoding: "utf8" });
  for (const file of ["tactical-foundation.html", "tactical-foundation.css"]) assert.ok(fs.existsSync(path.join(sandbox, "_site", file)));
  const html = fs.readFileSync(path.join(sandbox, "_site", "tactical-foundation.html"), "utf8");
  for (const name of ["defensive-shape", "attacking-buildup"]) {
    for (const extension of ["mp4", "jpg"]) {
      const file = path.join("media", "tactical-foundation", `${name}.${extension}`);
      assert.deepEqual(fs.readFileSync(path.join(sandbox, "_site", file)), fs.readFileSync(path.join(project, file)));
      assert.ok(html.includes(`media/tactical-foundation/${name}.${extension}?v=abcdef0`), `${file} is cache-busted`);
    }
  }
  assert.equal(fs.existsSync(path.join(sandbox, "_site", "media", "tactical-foundation", "unrelated.mp4")), false);
  assert.equal(fs.existsSync(path.join(sandbox, "_site", ".env")), false);
});
