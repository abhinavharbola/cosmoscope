import * as Astronomy from "astronomy-engine";
import { helioPosition, distanceAU } from "./ephemeris.js";
import { C_AU_S } from "./data.js";
import { shortDate } from "./format.js";

const QUARTERS = ["New Moon", "First quarter", "Full Moon", "Last quarter"];
const SEASONS = [
  ["mar_equinox", "March equinox"],
  ["jun_solstice", "June solstice"],
  ["sep_equinox", "September equinox"],
  ["dec_solstice", "December solstice"],
];

const BUCKET_MS = 43200000;
const cache = { key: null, quarters: [], seasons: [] };

function phaseName(d) {
  if (d < 6 || d > 354) return "New Moon";
  if (d < 84) return "Waxing crescent";
  if (d < 96) return "First quarter";
  if (d < 174) return "Waxing gibbous";
  if (d < 186) return "Full Moon";
  if (d < 264) return "Waning gibbous";
  if (d < 276) return "Last quarter";
  return "Waning crescent";
}

function quarterList(date) {
  const list = [];
  let q = Astronomy.SearchMoonQuarter(date);
  for (let i = 0; i < 3; i++) {
    list.push({ name: QUARTERS[q.quarter], ms: q.time.date.getTime() });
    q = Astronomy.NextMoonQuarter(q);
  }
  return list;
}

function seasonList(date) {
  const year = date.getUTCFullYear();
  const events = [];
  for (const y of [year, year + 1]) {
    const s = Astronomy.Seasons(y);
    for (const [key, name] of SEASONS) events.push({ name, ms: s[key].date.getTime() });
  }
  events.sort((a, b) => a.ms - b.ms);
  return events;
}

function firstAfter(list, ms) {
  return list.find((e) => e.ms > ms) || null;
}

function pack(e) {
  return e ? { name: e.name, date: shortDate(e.ms), ms: e.ms } : null;
}

export function almanac(ms) {
  const date = new Date(ms);
  const out = {};
  const earth = helioPosition("Earth", ms);
  const au = distanceAU(earth);
  out.earthSunAU = au;
  out.earthSunLightSec = au / C_AU_S;
  try {
    const deg = Astronomy.MoonPhase(date);
    out.moonPhase = phaseName(deg);
    out.moonLit = Astronomy.Illumination(Astronomy.Body.Moon, date).phase_fraction;
  } catch {
    out.moonPhase = null;
  }
  const key = Math.floor(ms / BUCKET_MS);
  const stale =
    cache.key !== key || !firstAfter(cache.quarters, ms) || !firstAfter(cache.seasons, ms);
  if (stale) {
    cache.key = key;
    const start = new Date(key * BUCKET_MS);
    try {
      cache.quarters = quarterList(start);
    } catch {
      cache.quarters = [];
    }
    try {
      cache.seasons = seasonList(start);
    } catch {
      cache.seasons = [];
    }
  }
  out.nextQuarter = pack(firstAfter(cache.quarters, ms));
  out.nextSeason = pack(firstAfter(cache.seasons, ms));
  return out;
}
