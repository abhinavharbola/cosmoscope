import * as Astronomy from "astronomy-engine";

let solarCache = { result: null };
let lunarCache = { result: null };

export function nextSolarEclipse(ms) {
  if (solarCache.result && solarCache.result.ms > ms) return solarCache.result;
  try {
    const e = Astronomy.SearchGlobalSolarEclipse(new Date(ms));
    solarCache.result = {
      kind: e.kind,
      ms: e.peak.date.getTime(),
      latitude: e.latitude,
      longitude: e.longitude,
    };
    return solarCache.result;
  } catch {
    solarCache.result = null;
    return null;
  }
}

export function nextLunarEclipse(ms) {
  if (lunarCache.result && lunarCache.result.ms > ms) return lunarCache.result;
  try {
    const e = Astronomy.SearchLunarEclipse(new Date(ms));
    lunarCache.result = {
      kind: e.kind,
      ms: e.peak.date.getTime(),
      obscuration: e.obscuration,
    };
    return lunarCache.result;
  } catch {
    lunarCache.result = null;
    return null;
  }
}