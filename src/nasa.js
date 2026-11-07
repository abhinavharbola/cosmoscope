import { readStore, writeStore, removeStore, storeKeys } from "./storage.js";

const BASE = "https://api.nasa.gov";
const TTL_MS = 60 * 60 * 1000;

export function getApiKey() {
  return readStore("nasa_api_key") || "DEMO_KEY";
}

export function setApiKey(key) {
  const clean = String(key || "").trim();
  if (clean) writeStore("nasa_api_key", clean);
  else removeStore("nasa_api_key");
}

export function clearCache() {
  storeKeys()
    .filter((k) => k.startsWith("nasa_cache_"))
    .forEach((k) => removeStore(k));
}

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

function readEntry(storeKey) {
  const raw = readStore(storeKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.t === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function prune() {
  const cutoff = Date.now() - 2 * 86400000;
  for (const k of storeKeys()) {
    if (!k.startsWith("nasa_cache_")) continue;
    const entry = readEntry(k);
    if (!entry || !(entry.t > cutoff)) removeStore(k);
  }
}

prune();

async function cached(name, loader) {
  const storeKey = `nasa_cache_${name}`;
  const fresh = readEntry(storeKey);
  if (fresh && Date.now() - fresh.t < TTL_MS) return { data: fresh.d, stale: false };
  try {
    const data = await loader();
    writeStore(storeKey, JSON.stringify({ t: Date.now(), d: data }));
    return { data, stale: false };
  } catch (err) {
    const old = readEntry(storeKey);
    if (old) return { data: old.d, stale: true };
    throw err;
  }
}

function proxyBase() {
  const m = document.querySelector('meta[name="nasa-proxy"]');
  const v = m && m.getAttribute("content");
  return v ? v.trim().replace(/\/+$/, "") : "";
}

export function usesProxy() {
  return proxyBase() !== "";
}

async function getJson(path) {
  const proxy = proxyBase();
  const url = proxy ? `${proxy}${path}` : `${BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(getApiKey())}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA API ${res.status}`);
  return res.json();
}

export function loadApod() {
  return cached(`apod_${ymd(new Date())}`, async () => {
    const j = await getJson("/planetary/apod");
    return { title: j.title, url: j.url, hdurl: j.hdurl, mediaType: j.media_type, date: j.date, copyright: j.copyright || null };
  });
}

export function loadNeo() {
  const today = ymd(new Date());
  return cached(`neo_${today}`, async () => {
    const j = await getJson(`/neo/rest/v1/feed?start_date=${today}&end_date=${today}`);
    const list = Object.values(j.near_earth_objects).flat();
    const rows = list
      .filter((n) => n.close_approach_data && n.close_approach_data[0])
      .map((n) => {
        const ca = n.close_approach_data[0];
        return {
          name: n.name.replace(/[()]/g, "").trim(),
          hazardous: n.is_potentially_hazardous_asteroid,
          lunarDistance: parseFloat(ca.miss_distance.lunar),
          speedKmS: parseFloat(ca.relative_velocity.kilometers_per_second),
          diameterM: n.estimated_diameter.meters.estimated_diameter_max,
        };
      });
    rows.sort((a, b) => a.lunarDistance - b.lunarDistance);
    return { count: rows.length, closest: rows[0] || null, hazardous: rows.filter((r) => r.hazardous).length };
  });
}

export function loadFlares() {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 86400000);
  return cached(`flr_${ymd(end)}`, async () => {
    const j = await getJson(`/DONKI/FLR?startDate=${ymd(start)}&endDate=${ymd(end)}`);
    const rows = (Array.isArray(j) ? j : []).map((f) => ({
      cls: f.classType,
      peak: f.peakTime,
      region: f.sourceLocation || null,
    }));
    rows.sort((a, b) => (a.peak < b.peak ? 1 : a.peak > b.peak ? -1 : 0));
    return { count: rows.length, latest: rows[0] || null };
  });
}
