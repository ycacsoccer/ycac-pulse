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
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    res.writeHead(500).end(String(error.message));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`serving ${ROOT} → http://127.0.0.1:${PORT}`);
});
