import { AU_KM } from "./data.js";

export const CATALOG_URL = "data/missions.json";
export const CATALOG_VERSION = 1;
export const MAX_SAMPLES = 4000;
export const KINDS = ["spacecraft", "comet", "asteroid"];
export const KIND_LABEL = { spacecraft: "Spacecraft", comet: "Comet", asteroid: "Asteroid" };
export const KIND_COLOR = { spacecraft: "#8fd0ff", comet: "#8fe8d2", asteroid: "#d2b48c" };
export const DEFAULT_SOURCE = {
  name: "NASA/JPL Horizons On-Line Ephemeris System",
  url: "https://ssd.jpl.nasa.gov/horizons/",
  citation:
    "Giorgini, J.D. et al. 1996, JPL's On-Line Solar System Data Service, Bulletin of the American Astronomical Society 28(3), 1158",
};

const DAY_MS = 86400000;
const ID = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const EPOCH_LO = Date.UTC(1700, 0, 1);
const EPOCH_HI = Date.UTC(2300, 0, 1);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function text(v, max) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function httpsUrl(v) {
  const u = text(v, 300);
  return u && /^https:\/\//.test(u) ? u : null;
}

function finiteArray(a, length) {
  if (!Array.isArray(a) || a.length !== length) return null;
  const out = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    if (typeof a[i] !== "number" || !Number.isFinite(a[i])) return null;
    out[i] = a[i];
  }
  return out;
}

export function hermiteAt(p, v, i, j, hDays, s, out = [0, 0, 0]) {
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  for (let k = 0; k < 3; k++) {
    out[k] = h00 * p[3 * i + k] + h10 * hDays * v[3 * i + k] + h01 * p[3 * j + k] + h11 * hDays * v[3 * j + k];
  }
  return out;
}

export function hermiteVelocityAt(p, v, i, j, hDays, s, out = [0, 0, 0]) {
  const s2 = s * s;
  const d00 = 6 * s2 - 6 * s;
  const d10 = 3 * s2 - 4 * s + 1;
  const d01 = -6 * s2 + 6 * s;
  const d11 = 3 * s2 - 2 * s;
  for (let k = 0; k < 3; k++) {
    out[k] = (d00 * p[3 * i + k] + d01 * p[3 * j + k]) / hDays + d10 * v[3 * i + k] + d11 * v[3 * j + k];
  }
  return out;
}

export function eclipticToScene(e) {
  return [e[0], e[2], -e[1]];
}

function normalizeEntry(id, raw) {
  if (!ID.test(id) || !isObject(raw)) return null;
  const kind = KINDS.includes(raw.kind) ? raw.kind : null;
  const name = text(raw.name, 60);
  if (!kind || !name) return null;
  const epochMs = raw.epochMs;
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs) || epochMs < EPOCH_LO || epochMs > EPOCH_HI) return null;
  if (!Array.isArray(raw.t)) return null;
  const n = raw.t.length;
  if (n < 2 || n > MAX_SAMPLES) return null;
  const t = finiteArray(raw.t, n);
  const p = finiteArray(raw.p, n * 3);
  const v = finiteArray(raw.v, n * 3);
  if (!t || !p || !v || t[0] !== 0) return null;
  for (let i = 1; i < n; i++) if (!(t[i] > t[i - 1])) return null;
  const trail = typeof raw.trailDays === "number" && Number.isFinite(raw.trailDays) && raw.trailDays > 0 ? raw.trailDays : null;
  const err = typeof raw.errorAU === "number" && Number.isFinite(raw.errorAU) && raw.errorAU >= 0 ? raw.errorAU : null;
  return {
    id,
    name,
    kind,
    color: typeof raw.color === "string" && COLOR.test(raw.color) ? raw.color : KIND_COLOR[kind],
    facts: text(raw.facts, 400),
    launch: text(raw.launch, 10),
    target: text(raw.target, 120),
    epochMs,
    t,
    p,
    v,
    trailDays: trail,
    errorAU: err,
  };
}

export function parseCatalog(raw) {
  const out = { generated: null, source: { ...DEFAULT_SOURCE }, objects: Object.create(null) };
  if (!isObject(raw) || raw.version !== CATALOG_VERSION || !isObject(raw.objects)) return out;
  if (isObject(raw.source)) {
    out.source = {
      name: text(raw.source.name, 120) || DEFAULT_SOURCE.name,
      url: httpsUrl(raw.source.url) || DEFAULT_SOURCE.url,
      citation: text(raw.source.citation, 300) || DEFAULT_SOURCE.citation,
    };
  }
  const gen = typeof raw.generated === "string" ? Date.parse(raw.generated) : NaN;
  out.generated = Number.isFinite(gen) ? gen : null;
  for (const [id, entry] of Object.entries(raw.objects)) {
    const clean = normalizeEntry(id, entry);
    if (clean) out.objects[id] = clean;
  }
  return out;
}

export async function loadCatalog(url = CATALOG_URL) {
  const signal = typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined;
  const res = await fetch(url, { cache: "no-cache", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCatalog(await res.json());
}

export function createTrack(entry) {
  const n = entry.t.length;
  const days = new Float64Array(n);
  for (let i = 0; i < n; i++) days[i] = entry.t[i] / 86400;
  const epochMs = entry.epochMs;
  const startMs = epochMs;
  const endMs = epochMs + entry.t[n - 1] * 1000;
  const scratch = [0, 0, 0];
  let hint = 0;

  function locate(d) {
    if (d <= days[0]) return 0;
    if (d >= days[n - 1]) return n - 2;
    if (d >= days[hint] && d < days[hint + 1]) return hint;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (days[mid] <= d) lo = mid;
      else hi = mid;
    }
    hint = lo;
    return lo;
  }

  function clampDays(ms) {
    return (Math.min(endMs, Math.max(startMs, ms)) - epochMs) / DAY_MS;
  }

  function positionAt(ms) {
    const d = clampDays(ms);
    const i = locate(d);
    const h = days[i + 1] - days[i];
    return eclipticToScene(hermiteAt(entry.p, entry.v, i, i + 1, h, (d - days[i]) / h, scratch));
  }

  function velocityAt(ms) {
    const d = clampDays(ms);
    const i = locate(d);
    const h = days[i + 1] - days[i];
    return eclipticToScene(hermiteVelocityAt(entry.p, entry.v, i, i + 1, h, (d - days[i]) / h, scratch));
  }

  function speedKmS(ms) {
    const v = velocityAt(ms);
    return (Math.hypot(v[0], v[1], v[2]) * AU_KM) / 86400;
  }

  function inRange(ms) {
    return ms >= startMs && ms <= endMs;
  }

  return { id: entry.id, count: n, startMs, endMs, positionAt, velocityAt, speedKmS, inRange };
}

export function pathPoints(entry, maxPoints = 2400) {
  const n = entry.t.length;
  const per = Math.max(1, Math.min(16, Math.floor((maxPoints - 1) / (n - 1))));
  const total = (n - 1) * per + 1;
  const pts = new Float32Array(total * 3);
  const ms = new Float64Array(total);
  const tmp = [0, 0, 0];
  let w = 0;
  for (let i = 0; i < n - 1; i++) {
    const h = (entry.t[i + 1] - entry.t[i]) / 86400;
    for (let k = 0; k < per; k++) {
      const s = k / per;
      const e = eclipticToScene(hermiteAt(entry.p, entry.v, i, i + 1, h, s, tmp));
      pts[w * 3] = e[0];
      pts[w * 3 + 1] = e[1];
      pts[w * 3 + 2] = e[2];
      ms[w] = entry.epochMs + (entry.t[i] + s * (entry.t[i + 1] - entry.t[i])) * 1000;
      w += 1;
    }
  }
  const last = eclipticToScene([entry.p[(n - 1) * 3], entry.p[(n - 1) * 3 + 1], entry.p[(n - 1) * 3 + 2]]);
  pts[w * 3] = last[0];
  pts[w * 3 + 1] = last[1];
  pts[w * 3 + 2] = last[2];
  ms[w] = entry.epochMs + entry.t[n - 1] * 1000;
  return { pts, ms };
}

export function pathHead(ms, at) {
  let lo = 0;
  let hi = ms.length - 1;
  if (at <= ms[0]) return 0;
  if (at >= ms[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ms[mid] <= at) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function trailAlpha(dtMs, spanMs) {
  if (dtMs >= 0) {
    if (dtMs > spanMs) return 0.06;
    const f = 1 - dtMs / spanMs;
    return 0.1 + 0.75 * f * f;
  }
  const ahead = -dtMs;
  if (ahead > spanMs) return 0;
  return 0.22 * (1 - ahead / spanMs);
}

export function trailSpanMs(entry) {
  const full = entry.t[entry.t.length - 1] * 1000;
  return entry.trailDays ? Math.min(full, entry.trailDays * DAY_MS) : full;
}

export function groupByKind(objects) {
  const out = [];
  for (const kind of KINDS) {
    const items = Object.values(objects).filter((o) => o.kind === kind);
    if (items.length) out.push({ kind, label: KIND_LABEL[kind], items });
  }
  return out;
}
