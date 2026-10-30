// Dependency-free static server — node scripts/serve-static.js [--port 4173]
// Playwright's webServer runs this for the local E2E suite. Serves the repo
// root (the same files GitHub Pages publishes) with correct MIME types and no
// directory traversal — the site itself is plain HTML/CSS/JS.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const portArg = process.argv.indexOf("--port");
const PORT = Number(portArg > -1 ? process.argv[portArg + 1] : process.env.PORT || 4319);

// build-info.json is generated at publish time (scripts/build-site.js).
// Local dev and the E2E suite run without a build step, so synthesize it from
// git HEAD once at startup — the footer badge behaves the same everywhere.
let buildInfoBody = null;
if (!fs.existsSync(path.join(ROOT, "build-info.json"))) {
  const info = { commit: "", builtAt: new Date().toISOString(), node: process.version };
  try {
    // eslint-disable-next-line global-require
    info.commit = require("child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (error) { /* no git available — the badge shows the time only */ }
  buildInfoBody = `${JSON.stringify(info, null, 2)}\n`;
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT)) { // traversal guard
      res.writeHead(403).end("forbidden");
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (pathname === "/build-info.json" && buildInfoBody) { // synthesized above
        res.writeHead(200, { "Content-Type": TYPES[".json"] }).end(buildInfoBody);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    const extension = path.extname(file).toLowerCase();
    const contentType = TYPES[extension] || "application/octet-stream";
    // Browsers request byte ranges when loading and seeking video. GitHub
    // Pages supports these; the local server should behave the same way.
    if (extension === ".mp4") {
      const size = fs.statSync(file).size;
      res.setHeader("Accept-Ranges", "bytes");
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        const suffix = range && !range[1] ? Number(range[2]) : null;
        const start = range ? (suffix != null ? Math.max(0, size - suffix) : Number(range[1])) : NaN;
        const end = range ? (suffix != null || !range[2] ? size - 1 : Math.min(Number(range[2]), size - 1)) : NaN;
        if (!range || (!range[1] && !range[2]) || suffix === 0 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
          return;
        }
        res.writeHead(206, { "Content-Type": contentType, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
        if (req.method === "HEAD") res.end();
        else fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.setHeader("Content-Length", size);
    }
    res.writeHead(200, { "Content-Type": contentType });
    if (req.method === "HEAD") { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error.message));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${ROOT} → http://127.0.0.1:${PORT}`);
});
