// Syntax gate — node scripts/check-syntax.js
// Every git-tracked .js/.cjs must parse (node --check) and every .json must be
// valid JSON. Fast, offline, no dependencies: this is the first gate in
// `npm run verify` and the whole of `npm run verify:fast`'s file half.
// Untracked-but-new files are walked in as well, so a file you just created
// but haven't staged yet is still checked.
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "playwright-report", "test-results", "_site", ".wrangler", ".playwright-mcp"]);
const SKIP_FILES = /\.gs$/; // legacy Apps Script leftovers

const failures = [];
const note = (ok, label, detail = "") => {
  if (!ok) failures.push(label + (detail ? ` — ${detail}` : ""));
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

/* git-tracked files (index = staged + committed) plus a walk for anything new. */
function trackedFiles() {
  const found = new Set();
  try {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
    out.toString("utf8").split("\0").filter(Boolean).forEach((file) => found.add(file));
  } catch (error) {
    console.log("note: git ls-files unavailable, walking the tree instead");
  }
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else {
        found.add(prefix + entry.name);
      }
    }
  };
  walk(ROOT, "");
  return [...found]
    .filter((file) => /\.(js|cjs|mjs|json)$/.test(file))
    .filter((file) => !file.split("/").some((part) => SKIP_DIRS.has(part)))
    .filter((file) => !SKIP_FILES.test(file));
}

const files = trackedFiles();
let jsCount = 0;
let jsonCount = 0;

for (const file of files.sort()) {
  const absolute = path.join(ROOT, file);
  if (!fs.existsSync(absolute)) continue; // deleted but still listed
  const source = fs.readFileSync(absolute, "utf8");
  if (file.endsWith(".json")) {
    jsonCount += 1;
    try {
      JSON.parse(source);
      note(true, `json parses: ${file}`);
    } catch (error) {
      note(false, `json parses: ${file}`, error.message);
    }
    continue;
  }
  jsCount += 1;
  const result = spawnSync(process.execPath, ["--check", absolute], { encoding: "utf8" });
  note(result.status === 0, `js parses: ${file}`, result.status === 0 ? "" : (result.stderr || "").trim().split("\n")[0]);
}

console.log("");
if (failures.length) {
  console.log(`${failures.length} SYNTAX FAILURE(S):`);
  failures.forEach((item) => console.log(`  - ${item}`));
  process.exit(1);
}
console.log(`Syntax verified: ${jsCount} js/cjs files parse, ${jsonCount} json files valid.`);
