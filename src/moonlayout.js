import { MOONS } from "./data.js";

const MOON_BASE_FACTOR = 1.5;
const MOON_RING_CLEARANCE = 1.15;
const MOON_OUTER_FACTOR = 5;

export const MOON_SYSTEMS = {};
for (const m of MOONS) {
  const s = (MOON_SYSTEMS[m.parent] ||= { moons: [], aMin: Infinity, aMax: -Infinity });
  s.moons.push(m);
  s.aMin = Math.min(s.aMin, m.semiMajorAU);
  s.aMax = Math.max(s.aMax, m.semiMajorAU);
}

export function moonDisplayDistance(moon, parent, trueLen, trueScale) {
  if (trueScale) return trueLen;
  const sys = MOON_SYSTEMS[moon.parent];
  const parentDisp = parent.radius;
  const ringOuter = parent.data.rings ? parentDisp * (parent.data.rings.outerKm / parent.data.radiusKm) : 0;
  const baseR = Math.max(parentDisp * MOON_BASE_FACTOR, ringOuter * MOON_RING_CLEARANCE);
  const outerR = Math.max(parentDisp * MOON_OUTER_FACTOR, baseR * 1.5);
  const t = sys.moons.length === 1 ? 1 : (moon.semiMajorAU - sys.aMin) / (sys.aMax - sys.aMin);
  return baseR + t * (outerR - baseR);
}
