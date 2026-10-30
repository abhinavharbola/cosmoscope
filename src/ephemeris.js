import * as Astronomy from "astronomy-engine";

const OBLIQUITY = (23.4392911 * Math.PI) / 180;
const COS_E = Math.cos(OBLIQUITY);
const SIN_E = Math.sin(OBLIQUITY);

export const MIN_MS = Date.UTC(1801, 0, 1);
export const MAX_MS = Date.UTC(2198, 11, 31);

const FALLBACK_PERIOD = {
  Mercury: 87.969,
  Venus: 224.701,
  Earth: 365.256,
  Mars: 686.98,
  Jupiter: 4332.589,
  Saturn: 10759.22,
  Uranus: 30685.4,
  Neptune: 60189,
  Pluto: 90560,
};

export function clampMs(ms) {
  const span = MAX_MS - MIN_MS;
  if (ms < MIN_MS) return MAX_MS - ((MIN_MS - ms) % span);
  if (ms > MAX_MS) return MIN_MS + ((ms - MAX_MS) % span);
  return ms;
}

function toThree(v) {
  const x = v.x;
  const y = v.y * COS_E + v.z * SIN_E;
  const z = -v.y * SIN_E + v.z * COS_E;
  return [x, z, -y];
}

export function helioPosition(bodyId, ms) {
  if (bodyId === "Sun") return [0, 0, 0];
  return toThree(Astronomy.HelioVector(Astronomy.Body[bodyId], new Date(ms)));
}

export function moonOffset(ms) {
  return toThree(Astronomy.GeoMoon(new Date(ms)));
}

export function poleVector(raDeg, decDeg) {
  const a = (raDeg * Math.PI) / 180;
  const d = (decDeg * Math.PI) / 180;
  return toThree({ x: Math.cos(d) * Math.cos(a), y: Math.cos(d) * Math.sin(a), z: Math.sin(d) });
}

export function gmstRad(ms) {
  return (Astronomy.SiderealTime(new Date(ms)) * 15 * Math.PI) / 180;
}

export function orbitalPeriodDays(bodyId) {
  try {
    const p = Astronomy.PlanetOrbitalPeriod(Astronomy.Body[bodyId]);
    if (Number.isFinite(p) && p > 0) return p;
  } catch {
    return FALLBACK_PERIOD[bodyId];
  }
  return FALLBACK_PERIOD[bodyId];
}

export function orbitSamples(bodyId, startMs, periodDays, count = 360) {
  const pts = new Float32Array(count * 3);
  const stepMs = (periodDays * 86400000) / count;
  for (let i = 0; i < count; i++) {
    const p = helioPosition(bodyId, clampMs(startMs + i * stepMs));
    pts[i * 3] = p[0];
    pts[i * 3 + 1] = p[1];
    pts[i * 3 + 2] = p[2];
  }
  return pts;
}

export function distanceAU(p) {
  return Math.hypot(p[0], p[1], p[2]);
}

export function separationAU(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
