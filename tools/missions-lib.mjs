import { AU_KM } from "../src/data.js";
import { hermiteAt, CATALOG_VERSION, KINDS, DEFAULT_SOURCE } from "../src/missions.js";

export const HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api";
export const POS_DECIMALS = 6;
export const VEL_DECIMALS = 9;
export const CHUNK_ROWS = 4000;

const DAY_MS = 86400000;

const round = (x, d) => Number(x.toFixed(d));

export function utcStamp(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

export function validateConfig(cfg) {
  const errors = [];
  if (!cfg || !Array.isArray(cfg.objects) || !cfg.objects.length) return ["objects must be a non-empty array"];
  const seen = new Set();
  for (const o of cfg.objects) {
    const tag = o && o.id ? o.id : "(no id)";
    if (!o || !/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(o.id)) errors.push(`${tag}: bad id`);
    else if (seen.has(o.id)) errors.push(`${tag}: duplicate id`);
    else seen.add(o.id);
    if (!o || !o.name) errors.push(`${tag}: name missing`);
    if (!o || !KINDS.includes(o.kind)) errors.push(`${tag}: kind must be one of ${KINDS.join(", ")}`);
    if (!o || typeof o.command !== "string" || !o.command.trim()) errors.push(`${tag}: command missing`);
    const a = o ? Date.parse(`${o.from}T00:00:00Z`) : NaN;
    const b = o ? Date.parse(`${o.to}T00:00:00Z`) : NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) errors.push(`${tag}: from and to must be YYYY-MM-DD with to after from`);
    if (!o || !Number.isInteger(o.stepMinutes) || o.stepMinutes < 1) errors.push(`${tag}: stepMinutes must be a positive integer`);
    if (!o || !(o.tolAU > 0)) errors.push(`${tag}: tolAU must be positive`);
    if (!o || !Number.isInteger(o.maxSamples) || o.maxSamples < 8) errors.push(`${tag}: maxSamples must be an integer of at least 8`);
  }
  return errors;
}

export function planChunks(cfg) {
  const startMs = Date.parse(`${cfg.from}T00:00:00Z`);
  const endMs = Date.parse(`${cfg.to}T00:00:00Z`);
  const stepMs = cfg.stepMinutes * 60000;
  const total = Math.floor((endMs - startMs) / stepMs) + 1;
  const chunks = [];
  for (let off = 0; off < total; off += CHUNK_ROWS) {
    const rows = Math.min(CHUNK_ROWS, total - off);
    chunks.push({ startMs: startMs + off * stepMs, stopMs: startMs + (off + rows - 1) * stepMs, rows, stepMs });
  }
  return { startMs, stepMs, total, chunks };
}

export function buildQuery(cfg, chunk) {
  const q = new URLSearchParams();
  const set = (k, v) => q.set(k, `'${v}'`);
  q.set("format", "json");
  set("COMMAND", cfg.command);
  set("OBJ_DATA", "YES");
  set("MAKE_EPHEM", "YES");
  set("EPHEM_TYPE", "VECTORS");
  set("CENTER", "500@10");
  set("REF_PLANE", "ECLIPTIC");
  set("REF_SYSTEM", "ICRF");
  set("OUT_UNITS", "AU-D");
  set("VEC_TABLE", "2");
  set("VEC_LABELS", "NO");
  set("CSV_FORMAT", "YES");
  set("START_TIME", utcStamp(chunk.startMs));
  set("STOP_TIME", utcStamp(chunk.stopMs));
  set("STEP_SIZE", `${chunk.stepMs / 60000} min`);
  return `${HORIZONS_API}?${q.toString()}`;
}

export function parseVectors(resultText) {
  const text = String(resultText);
  const a = text.indexOf("$$SOE");
  const b = text.indexOf("$$EOE");
  if (a < 0 || b < a) {
    throw new Error(`no ephemeris block in the Horizons reply:\n${text.slice(0, 600)}`);
  }
  const targetMatch = text.match(/Target body name:\s*(.+?)(?:\s{2,}|\{|\n)/);
  const rows = [];
  for (const line of text.slice(a + 5, b).split("\n")) {
    const f = line.split(",").map((s) => s.trim());
    if (f.length < 8) continue;
    const nums = [f[2], f[3], f[4], f[5], f[6], f[7]].map(Number);
    if (!nums.every(Number.isFinite)) throw new Error(`unreadable row: ${line.slice(0, 120)}`);
    rows.push(nums);
  }
  return { target: targetMatch ? targetMatch[1].trim() : null, rows };
}

export function densify(chunks, parsed) {
  const n = parsed.reduce((s, c) => s + c.rows.length, 0);
  const ms = new Float64Array(n);
  const p = new Float64Array(n * 3);
  const v = new Float64Array(n * 3);
  let w = 0;
  parsed.forEach((c, ci) => {
    const ch = chunks[ci];
    c.rows.forEach((r, k) => {
      ms[w] = ch.startMs + k * ch.stepMs;
      for (let j = 0; j < 3; j++) {
        p[w * 3 + j] = round(r[j], POS_DECIMALS);
        v[w * 3 + j] = round(r[3 + j], VEL_DECIMALS);
      }
      w += 1;
    });
  });
  return { ms, p, v, n };
}

export function thin(dense, tolAU) {
  const { ms, p, v, n } = dense;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const tmp = [0, 0, 0];
  const stack = [[0, n - 1]];
  let maxErr = 0;
  while (stack.length) {
    const [i, j] = stack.pop();
    if (j - i < 2) continue;
    const span = ms[j] - ms[i];
    const h = span / DAY_MS;
    let worst = -1;
    let worstErr = 0;
    for (let k = i + 1; k < j; k++) {
      hermiteAt(p, v, i, j, h, (ms[k] - ms[i]) / span, tmp);
      const e = Math.hypot(tmp[0] - p[3 * k], tmp[1] - p[3 * k + 1], tmp[2] - p[3 * k + 2]);
      if (e > worstErr) {
        worstErr = e;
        worst = k;
      }
    }
    if (worstErr > tolAU) {
      keep[worst] = 1;
      stack.push([i, worst], [worst, j]);
    } else if (worstErr > maxErr) {
      maxErr = worstErr;
    }
  }
  const indices = [];
  for (let i = 0; i < n; i++) if (keep[i]) indices.push(i);
  return { indices, maxErrAU: maxErr };
}

export function thinToCap(dense, tolAU, maxSamples) {
  let tol = tolAU;
  for (let guard = 0; guard < 60; guard++) {
    const r = thin(dense, tol);
    if (r.indices.length <= maxSamples) return { ...r, tolAU: tol };
    tol *= 1.35;
  }
  throw new Error(`could not reduce below ${maxSamples} samples`);
}

export function encodeObject(cfg, dense, thinned, target) {
  const ix = thinned.indices;
  const epochMs = dense.ms[ix[0]];
  const t = ix.map((i) => Math.round((dense.ms[i] - epochMs) / 1000));
  const p = [];
  const v = [];
  for (const i of ix) {
    for (let j = 0; j < 3; j++) {
      p.push(dense.p[3 * i + j]);
      v.push(dense.v[3 * i + j]);
    }
  }
  const out = {
    name: cfg.name,
    kind: cfg.kind,
    horizons: cfg.command,
    epochMs,
    t,
    p,
    v,
    errorAU: Math.ceil(thinned.maxErrAU * 1e10) / 1e10,
  };
  if (target) out.target = target;
  if (cfg.color) out.color = cfg.color;
  if (cfg.launch) out.launch = cfg.launch;
  if (cfg.facts) out.facts = cfg.facts;
  if (cfg.trailDays) out.trailDays = cfg.trailDays;
  return out;
}

export function serializeCatalog(catalog) {
  const head = {
    version: CATALOG_VERSION,
    generated: catalog.generated,
    frame: "heliocentric ecliptic J2000, AU and AU/day",
    source: catalog.source,
  };
  const lines = Object.entries(catalog.objects).map(([id, o]) => `${JSON.stringify(id)}:${JSON.stringify(o)}`);
  const h = JSON.stringify(head).slice(0, -1);
  return `${h},"objects":{\n${lines.join(",\n")}\n}}\n`;
}

export function emptyCatalog() {
  return { generated: null, source: { ...DEFAULT_SOURCE }, objects: {} };
}

export function describeError(errorAU) {
  return `${Math.ceil(errorAU * AU_KM).toLocaleString("en-US")} km`;
}
