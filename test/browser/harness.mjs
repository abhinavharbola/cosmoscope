import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const modules = path.join(root, "node_modules");

const JS = { "content-type": "text/javascript; charset=utf-8", "access-control-allow-origin": "*" };

const NASA = {
  apod: { title: "Fixture picture", url: "https://example.invalid/x", media_type: "other", date: "2026-11-01" },
  neo: { near_earth_objects: {} },
  flares: [],
};

export async function pinnedVersions() {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  const three = map.three.match(/three@([^/]+)\//)[1];
  const astro = map["astronomy-engine"].match(/astronomy-engine@([^/]+)\//)[1];
  return { three, astro };
}

async function installed(name) {
  const pkg = JSON.parse(await readFile(path.join(modules, name, "package.json"), "utf8"));
  return pkg.version;
}

export async function assertPinsMatch() {
  const pins = await pinnedVersions();
  const have = { three: await installed("three"), astro: await installed("astronomy-engine") };
  if (pins.three !== have.three || pins.astro !== have.astro) {
    throw new Error(
      `index.html pins three ${pins.three} and astronomy-engine ${pins.astro}, but node_modules has ${have.three} and ${have.astro}. Update the devDependencies to match.`
    );
  }
}

async function serveFrom(route, base, rel) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return route.fulfill({ status: 404, body: "not found" });
  try {
    return route.fulfill({ status: 200, headers: JS, body: await readFile(file) });
  } catch {
    return route.fulfill({ status: 404, body: "not found" });
  }
}

export async function installStubs(page) {
  await page.route("https://cdn.jsdelivr.net/npm/three@*/**", (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/npm\/three@[^/]+\//, "");
    return serveFrom(route, path.join(modules, "three"), rel);
  });
  await page.route("https://cdn.jsdelivr.net/npm/astronomy-engine@*/+esm", (route) =>
    serveFrom(route, path.join(modules, "astronomy-engine"), "esm/astronomy.js")
  );
  await page.route("https://fonts.googleapis.com/**", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/css" }, body: "" })
  );
  await page.route("https://api.nasa.gov/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    const body = p.includes("apod") ? NASA.apod : p.includes("neo") ? NASA.neo : NASA.flares;
    return route.fulfill({ status: 200, headers: { "content-type": "application/json", "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
}

export function watch(page) {
  const problems = [];
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error") problems.push(`console error: ${text}`);
    else if (m.type() === "warning" && /shader failed|Texture .*failed|Texture loading failed/i.test(text)) {
      problems.push(`console warning: ${text}`);
    }
  });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  return problems;
}

export async function bootDone(page, timeout = 150000) {
  await page.waitForFunction(() => window.cosmosReady === true, null, { timeout });
  await page.waitForFunction(() => !document.getElementById("intro"), null, { timeout });
}

export async function centerStats(page, buffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const size = 120;
    const data = ctx.getImageData(Math.floor((img.width - size) / 2), Math.floor((img.height - size) / 2), size, size).data;
    let sum = 0;
    let sq = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      sum += l;
      sq += l * l;
    }
    const mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sq / n - mean * mean)) };
  }, buffer.toString("base64"));
}
