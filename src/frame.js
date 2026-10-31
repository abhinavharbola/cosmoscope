const OBLIQUITY = (23.4392911 * Math.PI) / 180;
const COS_E = Math.cos(OBLIQUITY);
const SIN_E = Math.sin(OBLIQUITY);

const GALACTIC_CENTER = [266.40499, -28.93617];
const GALACTIC_POLE = [192.85948, 27.12825];

export function toThree(v) {
  const x = v.x;
  const y = v.y * COS_E + v.z * SIN_E;
  const z = -v.y * SIN_E + v.z * COS_E;
  return [x, z, -y];
}

export function equatorialUnit(raDeg, decDeg) {
  const a = (raDeg * Math.PI) / 180;
  const d = (decDeg * Math.PI) / 180;
  return { x: Math.cos(d) * Math.cos(a), y: Math.cos(d) * Math.sin(a), z: Math.sin(d) };
}

export function poleVector(raDeg, decDeg) {
  return toThree(equatorialUnit(raDeg, decDeg));
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function rotateByInverse(q, v) {
  const ux = -q.x;
  const uy = -q.y;
  const uz = -q.z;
  const tx = 2 * (uy * v[2] - uz * v[1]);
  const ty = 2 * (uz * v[0] - ux * v[2]);
  const tz = 2 * (ux * v[1] - uy * v[0]);
  return [
    v[0] + q.w * tx + (uy * tz - uz * ty),
    v[1] + q.w * ty + (uz * tx - ux * tz),
    v[2] + q.w * tz + (ux * ty - uy * tx),
  ];
}

export function moonSpinAngle(moonVec, tiltQuat) {
  const v = rotateByInverse(tiltQuat, moonVec);
  return Math.atan2(v[2], -v[0]);
}

export function quatFromUnitVectors(a, b) {
  const d = dot(a, b);
  if (d < -0.999999) return { x: 1, y: 0, z: 0, w: 0 };
  const c = cross(a, b);
  const q = { x: c[0], y: c[1], z: c[2], w: 1 + d };
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

export function rotateByQuat(q, v) {
  const ux = q.x;
  const uy = q.y;
  const uz = q.z;
  const tx = 2 * (uy * v[2] - uz * v[1]);
  const ty = 2 * (uz * v[0] - ux * v[2]);
  const tz = 2 * (ux * v[1] - uy * v[0]);
  return [
    v[0] + q.w * tx + (uy * tz - uz * ty),
    v[1] + q.w * ty + (uz * tx - ux * tz),
    v[2] + q.w * tz + (ux * ty - uy * tx),
  ];
}

export function galacticBasis() {
  const x = poleVector(GALACTIC_CENTER[0], GALACTIC_CENTER[1]);
  const p = poleVector(GALACTIC_POLE[0], GALACTIC_POLE[1]);
  const k = dot(x, p);
  const raw = [p[0] - k * x[0], p[1] - k * x[1], p[2] - k * x[2]];
  const len = Math.hypot(raw[0], raw[1], raw[2]);
  const y = [raw[0] / len, raw[1] / len, raw[2] / len];
  return { x, y, z: cross(x, y) };
}
