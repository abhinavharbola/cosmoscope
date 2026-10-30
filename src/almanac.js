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

const cache = { key: null, quarter: null, season: null };

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

function nextQuarter(date) {
  const q = Astronomy.SearchMoonQuarter(date);
  return { name: QUARTERS[q.quarter], ms: q.time.date.getTime() };
}

function nextSeason(date, ms) {
  const year = date.getUTCFullYear();
  const events = [];
  for (const y of [year, year + 1]) {
    const s = Astronomy.Seasons(y);
    for (const [key, name] of SEASONS) events.push({ name, ms: s[key].date.getTime() });
  }
  events.sort((a, b) => a.ms - b.ms);
  return events.find((e) => e.ms > ms) || null;
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
  const key = Math.floor(ms / 43200000);
  if (cache.key !== key) {
    cache.key = key;
    try {
      cache.quarter = nextQuarter(date);
    } catch {
      cache.quarter = null;
    }
    try {
      cache.season = nextSeason(date, ms);
    } catch {
      cache.season = null;
    }
  }
  out.nextQuarter = cache.quarter && cache.quarter.ms > ms ? { name: cache.quarter.name, date: shortDate(cache.quarter.ms), ms: cache.quarter.ms } : null;
  out.nextSeason = cache.season && cache.season.ms > ms ? { name: cache.season.name, date: shortDate(cache.season.ms), ms: cache.season.ms } : null;
  return out;
}
