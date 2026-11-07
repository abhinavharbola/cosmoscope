import * as Astronomy from "astronomy-engine";

function cachedFinder(search, shape) {
  let from = -Infinity;
  let hit = null;
  return (ms) => {
    if (hit && ms >= from && ms < hit.ms) return hit;
    try {
      hit = shape(search(new Date(ms)));
      from = ms;
      return hit;
    } catch {
      hit = null;
      from = -Infinity;
      return null;
    }
  };
}

export const nextSolarEclipse = cachedFinder(Astronomy.SearchGlobalSolarEclipse, (e) => ({
  kind: e.kind,
  ms: e.peak.date.getTime(),
  latitude: e.latitude,
  longitude: e.longitude,
}));

export const nextLunarEclipse = cachedFinder(Astronomy.SearchLunarEclipse, (e) => ({
  kind: e.kind,
  ms: e.peak.date.getTime(),
  obscuration: e.obscuration,
}));
