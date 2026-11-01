import { mkdir, readFile, writeFile, stat, readdir, rename } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const texDir = path.join(root, "textures");
const originals = path.join(root, "out", "originals");
const WIDTH = { "2k": 2048, "4k": 4096, "8k": 8192 };
const MASKS = new Set(["bump", "rough", "cloudMask"]);
const EXTS = [".tif", ".tiff", ".jpg", ".jpeg", ".png"];

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1].split(",") : fallback;
};

const tiers = option("tier", ["2k"]);
const only = option("only", null);
const manifestOnly = flag("manifest");
const force = flag("force");

for (const t of tiers) {
  if (!WIDTH[t]) {
    console.error(`Unknown tier ${t}. Use 2k, 4k or 8k.`);
    process.exit(2);
  }
}

const sources = JSON.parse(await readFile(new URL("./texture-sources.json", import.meta.url), "utf8"));
const exists = (p) => stat(p).then(() => true, () => false);
const failures = [];

async function findOriginal(base) {
  const names = await readdir(originals).catch(() => []);
  const hit = names.find((n) => EXTS.some((e) => n.toLowerCase() === `${base}${e}`.toLowerCase()));
  return hit ? path.join(originals, hit) : null;
}

async function download(url, base) {
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  const target = path.join(originals, `${base}${EXTS.includes(ext) ? ext : ".jpg"}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const part = `${target}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  await rename(part, target);
  return target;
}

async function acquire(id, slot, spec) {
  const base = `${id}_${slot}`;
  const cached = force ? null : await findOriginal(base);
  if (cached) return cached;
  if (!spec.url) {
    throw new Error(`No download URL. Get "${spec.product}" and save it as out/originals/${base}.tif, .jpg or .png`);
  }
  console.log(`  downloading ${spec.url}`);
  return download(spec.url, base);
}

async function convert(sharp, file, id, slot, wanted) {
  const meta = await sharp(file, { limitInputPixels: false }).metadata();
  const ratio = meta.width / meta.height;
  if (Math.abs(ratio - 2) > 0.04) throw new Error(`${path.basename(file)} is ${meta.width} x ${meta.height}, not 2:1 equirectangular`);
  let made = 0;
  for (const tier of wanted) {
    const w = WIDTH[tier];
    if (meta.width < w * 0.9) {
      console.log(`  ${id} ${slot} ${tier}: skipped, source is only ${meta.width} px wide`);
      continue;
    }
    const out = path.join(texDir, id, tier, `${slot}.jpg`);
    await mkdir(path.dirname(out), { recursive: true });
    let pipe = sharp(file, { limitInputPixels: false, sequentialRead: true }).resize(w, w / 2, { fit: "fill", kernel: "lanczos3" });
    pipe = MASKS.has(slot) ? pipe.greyscale().normalise() : pipe.removeAlpha().toColourspace("srgb");
    await pipe.jpeg({ quality: 86, mozjpeg: true }).toFile(out);
    const size = (await stat(out)).size;
    console.log(`  ${id} ${slot} ${tier}: ${(size / 1048576).toFixed(2)} MB`);
    made += 1;
  }
  return made;
}

async function buildManifest() {
  const bodies = {};
  for (const [id, src] of Object.entries(sources)) {
    const found = {};
    for (const tier of Object.keys(WIDTH)) {
      const files = {};
      for (const slot of Object.keys(src.slots)) {
        const rel = `${id}/${tier}/${slot}.jpg`;
        if (await exists(path.join(texDir, rel))) files[slot] = rel;
      }
      if (Object.keys(files).length) found[tier] = files;
    }
    if (!Object.values(found).some((f) => f.map)) continue;
    const entry = { credit: src.credit, license: src.license, url: src.url, centerLon: src.centerLon };
    if (src.note) entry.note = src.note;
    if (src.bumpScale) entry.bumpScale = src.bumpScale;
    entry.tiers = found;
    bodies[id] = entry;
  }
  await writeFile(path.join(texDir, "manifest.json"), `${JSON.stringify({ version: 2, bodies }, null, 2)}\n`);
  const listed = Object.keys(bodies);
  console.log(listed.length ? `manifest: ${listed.join(", ")}` : "manifest: no textures on disk, app stays procedural");
}

if (!manifestOnly) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("This tool needs sharp. Run: npm install --no-save sharp");
    process.exit(2);
  }
  await mkdir(originals, { recursive: true });
  for (const [id, src] of Object.entries(sources)) {
    if (only && !only.includes(id)) continue;
    console.log(id);
    for (const [slot, spec] of Object.entries(src.slots)) {
      try {
        const file = await acquire(id, slot, spec);
        await convert(sharp, file, id, slot, tiers);
      } catch (err) {
        failures.push(`${id} ${slot}: ${err.message}`);
        console.log(`  ${id} ${slot}: FAILED, ${err.message}`);
      }
    }
  }
}

await buildManifest();

if (failures.length) {
  console.log(`\n${failures.length} item(s) failed:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}
