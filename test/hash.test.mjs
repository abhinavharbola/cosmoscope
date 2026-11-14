import test from "node:test";
import assert from "node:assert/strict";
import { parseHash, buildHash, SCALE_MAX, SCALE_MIN } from "../src/hash.js";
import { VIEWS } from "../src/views.js";
import { ORDER, MOONS } from "../src/data.js";

const ids = new Set([...ORDER, ...MOONS.map((m) => m.id)]);
const valid = (f) => Object.hasOwn(VIEWS, f) || ids.has(f);

test("hash accepts known focus ids and rejects inherited property names", () => {
  assert.equal(parseHash("#f=Mars", valid).focus, "Mars");
  assert.equal(parseHash("#f=Io", valid).focus, "Io");
  assert.equal(parseHash("#f=Triton", valid).focus, "Triton");
  for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(parseHash(`#f=${bad}`, valid).focus, null, bad);
  }
});

test("hash range checks and round trip", () => {
  assert.equal(parseHash("#s=0", valid).scale, null);
  assert.equal(parseHash("#s=999999999999", valid).scale, null);
  assert.equal(parseHash("#t=1700-01-01T00:00:00Z", valid).ms, null);
  const now = Date.parse("2026-10-31T00:00:00Z");
  const h = buildHash("Mars", 3600, Date.parse("2020-01-01T00:00:00Z"), now);
  const back = parseHash(h, valid);
  assert.equal(back.focus, "Mars");
  assert.equal(back.scale, 3600);
  assert.equal(back.ms, Date.parse("2020-01-01T00:00:00Z"));
  assert.equal(buildHash("Overview", 1, now, now), "s=1");
});

test("hash carries pause and reverse flags", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");
  const h = buildHash("Mars", 60, now, now, { paused: true, reverse: true });
  const back = parseHash(h, valid);
  assert.equal(back.paused, true);
  assert.equal(back.reverse, true);
  const plain = parseHash(buildHash("Mars", 60, now, now), valid);
  assert.equal(plain.paused, false);
  assert.equal(plain.reverse, false);
});

test("scale extremes survive a hash round trip", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");
  for (const scale of [SCALE_MIN, 3600, 31557600, SCALE_MAX]) {
    const back = parseHash(buildHash("Overview", scale, now, now), valid).scale;
    assert.ok(back !== null, String(scale));
    assert.ok(Math.abs(back - scale) / scale < 1e-3, `${scale} ${back}`);
  }
});

test("hash carries view toggles", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");
  const h = buildHash("Earth", 30, now, now, { trueScale: true, orbits: false, labels: false });
  const back = parseHash(h, valid);
  assert.equal(back.trueScale, true);
  assert.equal(back.orbits, false);
  assert.equal(back.labels, false);
  const plain = parseHash(buildHash("Earth", 30, now, now, { orbits: true, labels: true }), valid);
  assert.equal(plain.trueScale, false);
  assert.equal(plain.orbits, true);
  assert.equal(plain.labels, true);
});

test("hash carries the missions toggle and craft focus ids", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");
  const withCraft = (f) => Object.hasOwn(VIEWS, f) || ids.has(f) || f === "Voyager1";
  const h = buildHash("Voyager1", 3600, now, now, { missions: false });
  const back = parseHash(h, withCraft);
  assert.equal(back.focus, "Voyager1");
  assert.equal(back.missions, false);
  assert.equal(parseHash(buildHash("Voyager1", 3600, now, now, { missions: true }), withCraft).missions, true);
  assert.equal(parseHash("#f=Voyager1", valid).focus, null);
});

test("hash time must be a full ISO stamp", () => {
  assert.equal(parseHash("#t=1", valid).ms, null);
  assert.equal(parseHash("#t=garbage", valid).ms, null);
  assert.equal(parseHash("#t=2020-06-01T12:00:00Z", valid).ms, Date.parse("2020-06-01T12:00:00Z"));
  assert.equal(parseHash("#t=2020-06-01", valid).ms, Date.parse("2020-06-01"));
});

test("hash times without an offset are read as UTC and scales must be plain numbers", () => {
  assert.equal(parseHash("#t=2020-06-01T12:00", valid).ms, Date.parse("2020-06-01T12:00:00Z"));
  assert.equal(parseHash("#t=2020-06-01T12:00:00%2B02:00", valid).ms, Date.parse("2020-06-01T10:00:00Z"));
  assert.equal(parseHash("#s=60abc", valid).scale, null);
  assert.equal(parseHash("#s=60", valid).scale, 60);
  assert.equal(parseHash("#s=1e3", valid).scale, 1000);
});

test("the camera view round trips through the hash with fixed precision", () => {
  const h = buildHash("Mars", 60, Date.now(), Date.now(), { view: { az: 30.04, el: -12.36, logDist: 0.7049 } });
  assert.match(h, /(^|&)v=30_-12\.4_0\.7(&|$)/);
  const back = parseHash(`#${h}`, valid).view;
  assert.deepEqual(back, { az: 30, el: -12.4, logDist: 0.7 });
});

test("a missing or non finite camera view adds nothing to the hash", () => {
  assert.ok(!buildHash("Mars", 60, Date.now(), Date.now(), {}).includes("v="));
  assert.ok(!buildHash("Mars", 60, Date.now(), Date.now(), { view: null }).includes("v="));
  assert.ok(!buildHash("Mars", 60, Date.now(), Date.now(), { view: { az: NaN, el: 0, logDist: 0 } }).includes("v="));
});

test("malformed or out of range camera views are rejected", () => {
  for (const bad of ["", "1_2", "a_b_c", "1_2_3_4", "181_0_0", "0_91_0", "0_0_3.5", "0_0_-8.5", "1e2_0_0", "0,0,0"]) {
    assert.equal(parseHash(`#v=${bad}`, valid).view, null, bad);
  }
  assert.deepEqual(parseHash("#v=-180_-90_-8", valid).view, { az: -180, el: -90, logDist: -8 });
  assert.deepEqual(parseHash("#v=180_90_3", valid).view, { az: 180, el: 90, logDist: 3 });
});
