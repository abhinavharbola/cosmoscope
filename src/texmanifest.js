export const TIERS = ["2k", "4k", "8k"];
export const BASE_TIER = "2k";
export const SLOTS = ["map", "bump", "rough", "lights", "clouds", "cloudMask"];
export const MASK_SLOTS = ["bump", "rough", "cloudMask"];

const ID = /^[A-Za-z][A-Za-z0-9]*$/;
const PATH = /^[A-Za-z0-9][A-Za-z0-9_.\-/]*$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function safePath(p) {
  if (typeof p !== "string" || p.length > 160 || !PATH.test(p)) return false;
  return !p.split("/").some((s) => s === "" || s === "." || s === "..");
}

export function centerLonOffset(deg) {
  const n = Number(deg);
  if (!Number.isFinite(n)) return 0;
  return n === 0 ? 0 : -n / 360;
}

function text(v, max) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function number(v, lo, hi) {
  return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
}

function normalizeEntry(entry) {
  if (!isObject(entry)) return null;
  const rawTiers = isObject(entry.tiers) ? entry.tiers : { [BASE_TIER]: entry };
  const tiers = {};
  for (const tier of TIERS) {
    const files = rawTiers[tier];
    if (!isObject(files)) continue;
    const clean = {};
    for (const slot of SLOTS) if (safePath(files[slot])) clean[slot] = files[slot];
    if (Object.keys(clean).length) tiers[tier] = clean;
  }
  if (!TIERS.some((t) => tiers[t] && tiers[t].map)) return null;
  const url = text(entry.url, 300);
  return {
    tiers,
    credit: text(entry.credit, 300),
    license: text(entry.license, 80),
    note: text(entry.note, 300),
    url: url && /^https:\/\//.test(url) ? url : null,
    centerLon: number(entry.centerLon, -360, 360) ?? 0,
    bumpScale: number(entry.bumpScale, 0, 10),
  };
}

export function parseManifest(raw) {
  const out = Object.create(null);
  if (!isObject(raw)) return out;
  const source = isObject(raw.bodies) ? raw.bodies : raw;
  for (const [id, entry] of Object.entries(source)) {
    if (!ID.test(id)) continue;
    const clean = normalizeEntry(entry);
    if (clean) out[id] = clean;
  }
  return out;
}

export function resolveFiles(entry, wanted) {
  const w = Math.max(0, TIERS.indexOf(wanted));
  const order = [];
  for (let i = w; i >= 0; i--) order.push(TIERS[i]);
  for (let i = w + 1; i < TIERS.length; i++) order.push(TIERS[i]);
  const out = {};
  for (const slot of SLOTS) {
    for (const tier of order) {
      const files = entry.tiers[tier];
      if (files && files[slot]) {
        out[slot] = { file: files[slot], tier };
        break;
      }
    }
  }
  return out;
}

export function surfaceKey(entry, wanted) {
  const picks = resolveFiles(entry, wanted);
  return SLOTS.filter((s) => picks[s])
    .map((s) => `${s}:${picks[s].file}`)
    .join("|");
}

export function availableTiers(manifest) {
  return TIERS.filter((t) => Object.values(manifest).some((e) => e.tiers[t] && e.tiers[t].map));
}
