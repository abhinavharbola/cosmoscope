import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import {
  validateConfig,
  planChunks,
  buildQuery,
  parseVectors,
  densify,
  thinToCap,
  encodeObject,
  serializeCatalog,
  emptyCatalog,
  describeError,
} from "./missions-lib.mjs";

const root = new URL("../", import.meta.url);
const DEFAULT_CONFIG = "tools/missions-sources.json";
const DEFAULT_OUT = "data/missions.json";
const DEFAULT_MAX_KB = 700;
const PAUSE_MS = 400;
const RETRIES = 3;

function parseArgs(argv) {
  const out = { only: null, config: DEFAULT_CONFIG, out: DEFAULT_OUT, maxKb: DEFAULT_MAX_KB, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--only") out.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--config") out.config = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--max-kb") out.maxKb = Number(argv[++i]);
    else if (a === "--dry") out.dry = true;
    else throw new Error(`unknown option ${a}`);
  }
  if (!Number.isFinite(out.maxKb) || out.maxKb <= 0) throw new Error("--max-kb must be a positive number");
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, fetchImpl) {
  let last = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { "user-agent": "cosmoscope-mission-baker" } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw Object.assign(new Error(`Horizons: ${json.error}`), { fatal: true });
      if (typeof json.result !== "string") throw Object.assign(new Error("Horizons reply has no result text"), { fatal: true });
      return json.result;
    } catch (err) {
      last = err;
      if (err.fatal) break;
      await sleep(PAUSE_MS * attempt * 2);
    }
  }
  throw last;
}

export async function bakeObject(cfg, fetchImpl = fetch, pause = PAUSE_MS) {
  const plan = planChunks(cfg);
  const parsed = [];
  let target = null;
  for (const chunk of plan.chunks) {
    const result = await request(buildQuery(cfg, chunk), fetchImpl);
    const one = parseVectors(result);
    if (one.rows.length !== chunk.rows) {
      throw new Error(`${cfg.id}: asked for ${chunk.rows} rows and got ${one.rows.length}. Check the from and to dates against the target's ephemeris coverage.`);
    }
    if (!target) target = one.target;
    parsed.push(one);
    await sleep(pause);
  }
  const dense = densify(plan.chunks, parsed);
  const thinned = thinToCap(dense, cfg.tolAU, cfg.maxSamples);
  return { entry: encodeObject(cfg, dense, thinned, target), dense: dense.n, kept: thinned.indices.length, tolAU: thinned.tolAU, target };
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(new URL(file, root), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT" && fallback !== undefined) return fallback;
    throw err;
  }
}

export async function main(argv) {
  const opts = parseArgs(argv);
  const cfg = await readJson(opts.config);
  const problems = validateConfig(cfg);
  if (problems.length) throw new Error(`bad config:\n${problems.join("\n")}`);

  const wanted = opts.only ? cfg.objects.filter((o) => opts.only.includes(o.id)) : cfg.objects;
  if (opts.only) {
    const missing = opts.only.filter((id) => !cfg.objects.some((o) => o.id === id));
    if (missing.length) throw new Error(`not in config: ${missing.join(", ")}`);
  }

  const existing = await readJson(opts.out, null);
  const catalog = emptyCatalog();
  if (existing && existing.version === 1 && existing.objects) {
    for (const o of cfg.objects) if (existing.objects[o.id]) catalog.objects[o.id] = existing.objects[o.id];
  }
  if (cfg.source) catalog.source = { ...catalog.source, ...cfg.source };

  const failures = [];
  for (const o of wanted) {
    process.stdout.write(`${o.id}: ${planChunks(o).total} dense rows ... `);
    try {
      const r = await bakeObject(o);
      catalog.objects[o.id] = r.entry;
      console.log(`${r.kept} samples, tolerance ${r.tolAU.toExponential(2)} AU, max error ${describeError(r.entry.errorAU)}${r.target ? `, target "${r.target}"` : ""}`);
    } catch (err) {
      failures.push(o.id);
      console.log(`FAILED\n${err.message}`);
    }
  }

  const ordered = {};
  for (const o of cfg.objects) if (catalog.objects[o.id]) ordered[o.id] = catalog.objects[o.id];
  catalog.objects = ordered;
  catalog.generated = new Date().toISOString().slice(0, 19) + "Z";

  const body = serializeCatalog(catalog);
  const kb = Buffer.byteLength(body) / 1024;
  console.log(`${Object.keys(ordered).length} objects, ${kb.toFixed(0)} KB`);
  if (kb > opts.maxKb) {
    throw new Error(`catalog is ${kb.toFixed(0)} KB, over the ${opts.maxKb} KB cap. Raise tolAU, lower maxSamples or shorten the window in ${opts.config}. Nothing was written.`);
  }
  if (!opts.dry) {
    const target = new URL(opts.out, root);
    await mkdir(path.dirname(fileURLToPath(target)), { recursive: true });
    await writeFile(target, body);
    console.log(`wrote ${opts.out}`);
  }
  if (failures.length) throw new Error(`failed: ${failures.join(", ")}. Fix command, from or to in ${opts.config} and rerun with --only ${failures.join(",")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
