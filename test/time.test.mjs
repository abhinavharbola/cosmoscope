import test from "node:test";
import assert from "node:assert/strict";
import { MIN_MS, MAX_MS, clampMs, orbitWindowStart } from "../src/timeutil.js";
import { formatDuration, formatRate } from "../src/format.js";
import { C_AU_S } from "../src/data.js";

const D = Math.PI / 180;

function kepler(el, ms) {
  const T = (ms / 86400000 + 2440587.5 - 2451545) / 36525;
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const L = el.L[0] + el.L[1] * T;
  const w = el.w[0] + el.w[1] * T;
  let M = (((L - w) % 360) + 360) % 360 * D;
  let E = M;
  for (let i = 0; i < 30; i++) E = M + e * Math.sin(E);
  return a * (1 - e * Math.cos(E));
}

const EARTH = { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], L: [100.46457166, 35999.37306329], w: [102.93768193, 0.32327364] };

test("clock wraps inside the supported range", () => {
  assert.equal(clampMs(MIN_MS), MIN_MS);
  assert.ok(clampMs(MIN_MS - 86400000) < MAX_MS && clampMs(MIN_MS - 86400000) > MAX_MS - 2 * 86400000);
  assert.ok(clampMs(MAX_MS + 86400000) > MIN_MS);
  for (const ms of [MIN_MS - 1e12, MAX_MS + 1e12]) assert.ok(clampMs(ms) >= MIN_MS && clampMs(ms) <= MAX_MS);
});

test("orbit sample windows never leave the supported range", () => {
  for (const days of [87.969, 224.701, 365.256, 686.98, 4332.589, 10759.22, 30685.4, 60189, 90560]) {
    for (const start of [MIN_MS, MIN_MS + 1e10, (MIN_MS + MAX_MS) / 2, MAX_MS - 1e10, MAX_MS]) {
      const s = orbitWindowStart(start, days);
      assert.ok(s >= MIN_MS && s + days * 86400000 <= MAX_MS, `${days} ${start}`);
    }
  }
});

test("earth light time today is near 8 min 16 s, not 8 min 19 s", () => {
  const r = kepler(EARTH, Date.parse("2026-10-30T18:00:00Z"));
  assert.ok(r > 0.9925 && r < 0.9940, String(r));
  assert.match(formatDuration(r / C_AU_S), /^8 min 1[56] s$/);
  let lo = 9;
  let hi = 0;
  for (let d = 0; d < 366; d++) {
    const x = kepler(EARTH, Date.parse("2026-01-01T00:00:00Z") + d * 86400000);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  assert.match(formatDuration(lo / C_AU_S), /^8 min (9|10|11) s$/);
  assert.match(formatDuration(hi / C_AU_S), /^8 min (26|27|28) s$/);
});

test("formatting", () => {
  assert.equal(formatDuration(499), "8 min 19 s");
  assert.equal(formatDuration(1 / C_AU_S), "8 min 19 s");
  assert.equal(formatRate(1), "Real time");
  assert.equal(formatRate(315576000), "1 s = 10 years");
});
