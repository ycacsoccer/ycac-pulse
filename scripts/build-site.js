// Publishable-file whitelist — node scripts/build-site.js [--sha <commit>]
// Copies ONLY the site's own files into _site/, which is what CI uploads as
// the GitHub Pages artifact. Branch-based Pages published the whole repo tree
// (verifier scripts, plan docs, tests …); this keeps the public site to:
// pages, stylesheets, runtime scripts, favicon and the tactical clips.
//
// HTML gets cache-busting: local <script src>/<link href> and tactical media
// gain ?v=<short sha>,
// so every deploy changes the asset URLs. GitHub Pages serves subresources with
// max-age=600 — without this, a reload within those 10 minutes pairs the fresh
// HTML with yesterday's JS (a half-updated page: new markup, old renderer).
//
// .env never matches the whitelist by construction — it cannot be published.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "_site");

// Page/shell files first, then the runtime code every page loads.
const INCLUDE = [
  /\/?[^/]*\.html$/,          // every page: index, players, player, coach, admin, match, team, login
  /\.css$/,
  /\.(js|cjs)$/,              // runtime scripts + the verify-*.cjs? no: see ALLOW below
  /\.svg$/,
  /\.ico$/,
  /^\/?media\/tactical-foundation\/(?:defensive-shape|attacking-buildup|defensive-warmup|attacking-warmup)\.(?:mp4|jpg)$/,
  /^\/?build-info\.json$/,
];
// Explicit carve-outs: tooling that shares a .js/.cjs extension stays out.
const EXCLUDE = [
  /^\/?(package|package-lock)\.json$/,
  /^\/?scripts\//,
  /^\/?tests\//,
  /^\/?supabase\//,
  /^\/?\.husky\//,
  /^\/?\.github\//,
  /^\/?verify-.*\.(cjs|js)$/,
  /^\/?migrate-from-sheets\.cjs$/,
  /^\/?(playwright|playwright\.smoke)\.config\.js$/,
  /^\/?_site\//,
];

const shaArg = process.argv.indexOf("--sha");
const sha = shaArg > -1 ? process.argv[shaArg + 1] : require("child_process").execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim();

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const walk = (dir, prefix = "") => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "_site", "playwright-report", "test-results"].includes(entry.name)) continue;
      walk(path.join(dir, entry.name), `${rel}/`);
      continue;
    }
    const slashRel = rel.replace(/\\/g, "/");
    if (!INCLUDE.some((pattern) => pattern.test(`/${slashRel}`))) continue;
    if (EXCLUDE.some((pattern) => pattern.test(slashRel))) continue;
    const target = path.join(OUT, slashRel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const source = path.join(dir, entry.name);
    if (/\.html$/.test(entry.name)) {
      const busted = fs.readFileSync(source, "utf8")
        .replace(/(src|href)="([^"?]+\.(?:js|css))"/g, `$1="$2?v=${sha.slice(0, 7)}"`)
        .replace(/(src|href|poster)="(media\/tactical-foundation\/[^"?]+\.(?:mp4|jpg))"/g, `$1="$2?v=${sha.slice(0, 7)}"`);
      fs.writeFileSync(target, busted);
    } else {
      fs.copyFileSync(source, target);
    }
  }
};
walk(ROOT);

const info = {
  commit: sha,
  builtAt: new Date().toISOString(),
  node: process.version,
};
fs.writeFileSync(path.join(OUT, "build-info.json"), `${JSON.stringify(info, null, 2)}\n`);

const published = [];
const collect = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) collect(full);
  else published.push(path.relative(OUT, full).replace(/\\/g, "/"));
});
collect(OUT);

console.log(`_site/ built — ${published.length} files, commit ${sha.slice(0, 7)}`);
console.log(published.sort().join("\n"));
