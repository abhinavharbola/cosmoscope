import * as Astronomy from "astronomy-engine";

const OBLIQUITY = (23.4392911 * Math.PI) / 180;
const COS_E = Math.cos(OBLIQUITY);
const SIN_E = Math.sin(OBLIQUITY);

export const MIN_MS = Date.UTC(1801, 0, 1);
export const MAX_MS = Date.UTC(2198, 11, 31);

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
  const date = new Date(ms);
  if (bodyId === "Sun") return [0, 0, 0];
  return toThree(Astronomy.HelioVector(Astronomy.Body[bodyId], date));
}

export function moonOffset(ms) {
  return toThree(Astronomy.GeoMoon(new Date(ms)));
}

export function orbitSamples(bodyId, startMs, periodDays, count = 360) {
  const pts = new Float32Array(count * 3);
  const stepMs = (periodDays * 86400000) / count;
  for (let i = 0; i < count; i++) {
    const ms = clampMs(startMs + i * stepMs);
    const p = helioPosition(bodyId, ms);
    pts[i * 3] = p[0];
    pts[i * 3 + 1] = p[1];
    pts[i * 3 + 2] = p[2];
  }
  return pts;
}

export function distanceAU(p) {
  return Math.hypot(p[0], p[1], p[2]);
}
