import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUN, PLANETS, MOON, POLES, MOMENTS } from "../src/data.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/nssdc.json", import.meta.url)));
const all = [SUN, ...PLANETS, MOON];

test("body values match the pinned NSSDC fixture", () => {
  for (const b of all) {
    const ref = fx.bodies[b.id];
    for (const [k, v] of Object.entries(ref)) assert.ok(Math.abs(b[k] - v) < 1e-9, `${b.id}.${k}: ${b[k]} vs ${v}`);
  }
});

test("poles match NSSDC within 0.005 degrees", () => {
  for (const [id, [ra, dec]] of Object.entries(fx.poles)) {
    assert.ok(Math.abs(POLES[id][0] - ra) < 0.005 && Math.abs(POLES[id][1] - dec) < 0.005, id);
  }
});

test("saturn ring edges match NSSDC", () => {
  const r = PLANETS.find((p) => p.id === "Saturn").rings;
  const by = Object.fromEntries(r.bands.map((x) => [x.name, x]));
  assert.deepEqual([by.C.fromKm, by.C.toKm], fx.saturnRingsKm.C);
  assert.deepEqual([by.B.fromKm, by.B.toKm], fx.saturnRingsKm.B);
  assert.deepEqual([by.A.fromKm, by.A.toKm], fx.saturnRingsKm.A);
  assert.equal(by.Cassini.fromKm, by.B.toKm);
  assert.equal(by.Cassini.toKm, by.A.fromKm);
  assert.equal(r.gaps[0].fromKm, fx.saturnRingsKm.enckeGapInner);
});

test("spin sign follows the IAU rate sign of W about the listed pole", () => {
  for (const b of all) assert.equal((b.spinSign ?? 1) > 0, fx.positiveRotationRate[b.id], b.id);
});

test("moments are verified instants", () => {
  const iso = Object.fromEntries(MOMENTS.map((m) => [m.label, m.iso]));
  assert.equal(iso["Voyager 1 launch"], "1977-09-05T12:56:01Z");
  assert.equal(iso["Apollo 11 lands"], "1969-07-20T20:17:40Z");
  assert.equal(iso["Venus transit, greatest"], "2012-06-06T01:29:36Z");
  assert.equal(iso["Jupiter and Saturn conjunct"], "2020-12-21T18:20:00Z");
});

const G = 6.674e-11;
const mass = (b) => b.massE24 * 1e24;
const rM = (b) => b.radiusKm * 1000;
const within = (a, b, tol) => Math.abs(a - b) / b <= tol;

test("density follows from mass and mean radius", () => {
  for (const b of all) {
    const rho = mass(b) / ((4 / 3) * Math.PI * rM(b) ** 3);
    assert.ok(within(rho, b.densityKgM3, 0.05), `${b.id} ${rho} vs ${b.densityKgM3}`);
  }
});

test("escape velocity follows from mass and radius", () => {
  for (const b of all) {
    const v = Math.sqrt((2 * G * mass(b)) / rM(b)) / 1000;
    assert.ok(within(v, b.escapeKmS, 0.1), `${b.id} ${v} vs ${b.escapeKmS}`);
  }
});

test("surface gravity follows from mass and radius for near-spherical bodies", () => {
  for (const b of all.filter((x) => ["Sun", "Mercury", "Venus", "Earth", "Mars", "Moon"].includes(x.id))) {
    const g = (G * mass(b)) / rM(b) ** 2;
    assert.ok(within(g, b.gravity, 0.05), `${b.id} ${g} vs ${b.gravity}`);
  }
});

test("prime meridian rates agree with rotation periods and spin signs", () => {
  for (const b of all.filter((x) => x.W0 !== undefined)) {
    const hours = (360 / Math.abs(b.Wdot)) * 24;
    assert.ok(within(hours, Math.abs(b.rotationHours), 0.015), `${b.id} ${hours} vs ${b.rotationHours}`);
    assert.equal(b.Wdot > 0, (b.spinSign ?? 1) > 0, b.id);
  }
});
