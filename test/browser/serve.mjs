import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const BLOCKED = new Set(["node_modules", ".git", "out", "test-results", "test", "tools", "deploy"]);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(root, rel));
    const inside = file === root || file.startsWith(root + path.sep);
    const top = path.relative(root, file).split(path.sep)[0];
    if (!inside || BLOCKED.has(top) || top.startsWith(".")) {
      res.writeHead(404).end("not found");
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serving ${root} on http://127.0.0.1:${port}`);
});
