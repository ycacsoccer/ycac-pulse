// Verifier runner — node scripts/run-verifiers.js [--group=anon|live|all]
// The repo's 14 `verify-*.cjs` suites, run sequentially with one summary and a
// single exit code, so npm scripts and CI get a pass/fail instead of having to
// poll fourteen processes.
//
//   anon — needs only the publishable key already committed in config.js
//          (offline i18n checks + read-only queries against the public tables).
//          Safe anywhere: local, pre-push, GitHub Actions.
//   live — needs SUPABASE_SERVICE_ROLE_KEY from .env: these create ephemeral
//          users and write/restore rows against the real project, so they run
//          on the developer's machine only (npm run verify:live).
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const GROUPS = {
  anon: ["verify-i18n", "verify-stats", "verify-index", "verify-render", "verify-profile-render"],
  live: [
    "verify-import", "verify-auth", "verify-coach", "verify-profiles", "verify-admin",
    "verify-match", "verify-team", "verify-picker", "verify-injuries",
  ],
};

const arg = process.argv.find((item) => item.startsWith("--group="));
const group = arg ? arg.split("=")[1] : "all";
if (!["anon", "live", "all"].includes(group)) {
  console.error(`unknown --group=${group} (use anon, live or all)`);
  process.exit(2);
}
const selected = group === "all" ? [...GROUPS.anon, ...GROUPS.live] : GROUPS[group];

if (group !== "anon" && !fs.existsSync(path.join(__dirname, "..", ".env"))) {
  console.error("No .env found — the live suites need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (see README).");
  process.exit(2);
}

const results = [];
for (const name of selected) {
  const file = path.join(__dirname, "..", `${name}.cjs`);
  if (!fs.existsSync(file)) {
    results.push({ name, ok: false, note: "missing" });
    console.log(`FAIL ${name} — script not found`);
    continue;
  }
  console.log(`\n── ${name} ${"─".repeat(Math.max(0, 58 - name.length))}`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [file], { cwd: path.join(__dirname, ".."), encoding: "utf8", timeout: 5 * 60 * 1000 });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const ok = run.status === 0;
  results.push({ name, ok, note: `${seconds}s` });
  const output = `${run.stdout || ""}${run.stderr || ""}`.trim();
  if (!ok) console.log(output.split("\n").slice(-25).join("\n"));
  console.log(`${ok ? "OK  " : "FAIL"} ${name} (${seconds}s)`);
}

console.log("");
const failed = results.filter((item) => !item.ok);
if (failed.length) {
  console.log(`${failed.length}/${results.length} VERIFIER(S) FAILED: ${failed.map((item) => item.name).join(", ")}`);
  process.exit(1);
}
console.log(`${results.length}/${results.length} verifiers green (${group}): ${results.map((item) => item.name).join(", ")}`);
