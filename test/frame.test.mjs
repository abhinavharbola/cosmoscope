import test from "node:test";
import assert from "node:assert/strict";
import { toThree, poleVector, equatorialUnit, galacticBasis, moonSpinAngle, quatFromUnitVectors, rotateByQuat } from "../src/frame.js";
import { POLES } from "../src/data.js";

const D = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => a.map((x) => x / len(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const eclipticOf = (v) => ({ lon: ((Math.atan2(-v[2], v[0]) / D) + 360) % 360, lat: Math.asin(v[1]) / D });
const UP = [0, 1, 0];

test("toThree is a proper rotation", () => {
  const a = toThree({ x: 1, y: 0, z: 0 });
  const b = toThree({ x: 0, y: 1, z: 0 });
  const c = toThree({ x: 0, y: 0, z: 1 });
  assert.ok(Math.abs(dot(cross(a, b), c) - 1) < 1e-12);
});

test("galactic centre and plane tilt in the scene", () => {
  const g = galacticBasis();
  const e = eclipticOf(g.x);
  assert.ok(Math.abs(e.lon - 266.84) < 0.05 && Math.abs(e.lat + 5.54) < 0.05);
  assert.ok(Math.abs(Math.acos(dot(g.y, UP)) / D - 60.19) < 0.05);
  assert.ok(Math.abs(dot(g.x, g.y)) < 1e-12 && Math.abs(len(g.z) - 1) < 1e-12);
});

function sunLongitude(ms) {
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
  const L0 = 280.46646 + 36000.76983 * T;
  const M = (357.52911 + 35999.05029 * T) * D;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) + 0.019993 * Math.sin(2 * M) + 0.000289 * Math.sin(3 * M);
  return (((L0 + C) % 360) + 360) % 360;
}

test("earth north pole leans toward the sun at the june solstice only", () => {
  const pole = poleVector(...POLES.Earth);
  assert.ok(Math.abs(Math.acos(pole[1]) / D - 23.4393) < 1e-3);
  const lean = (iso) => {
    const lon = sunLongitude(Date.parse(iso)) * D;
    return dot(pole, [Math.cos(lon), 0, -Math.sin(lon)]);
  };
  assert.ok(lean("2026-06-21T08:25:00Z") > 0.39);
  assert.ok(lean("2026-12-21T20:50:00Z") < -0.39);
  assert.ok(Math.abs(lean("2026-03-20T14:46:00Z")) < 0.01);
});

test("earth greenwich meridian sits at right ascension equal to sidereal angle", () => {
  const q = quatFromUnitVectors(UP, poleVector(...POLES.Earth));
  for (const deg of [0, 33, 90, 150, 211, 300]) {
    const t = deg * D;
    const world = rotateByQuat(q, [Math.cos(t), 0, -Math.sin(t)]);
    const want = toThree(equatorialUnit(deg, 0));
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(world[i] - want[i]) < 1e-9);
  }
});

test("sphere uv: u=0.5 faces +x and longitude grows in the rotation direction", () => {
  const p = (u) => [-Math.cos(u * 2 * Math.PI), 0, Math.sin(u * 2 * Math.PI)];
  const a = p(0.5);
  const b = p(0.51);
  assert.ok(Math.abs(a[0] - 1) < 1e-12);
  assert.ok(b[2] < 0);
});

test("moon near side axis is the projection of the earth direction on the lunar equator", () => {
  const pole = poleVector(...POLES.Moon);
  const q = quatFromUnitVectors(UP, pole);
  for (let i = 0; i < 360; i += 7) {
    const a = i * D;
    const inc = 5.145 * D;
    const m = [Math.cos(a), Math.sin(a) * Math.sin(inc), -Math.sin(a) * Math.cos(inc)];
    const th = moonSpinAngle(m, q);
    const d = rotateByQuat(q, [Math.cos(th), 0, -Math.sin(th)]);
    assert.ok(Math.abs(dot(d, pole)) < 1e-9);
    const toEarth = m.map((x) => -x);
    const k = dot(toEarth, pole);
    const proj = norm(toEarth.map((x, j) => x - k * pole[j]));
    assert.ok(dot(d, proj) > 1 - 1e-9);
  }
});
