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
