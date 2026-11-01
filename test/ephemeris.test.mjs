import test from "node:test";
import assert from "node:assert/strict";

let A = null;
try {
  A = await import("astronomy-engine");
} catch {
  A = null;
}
const skip = A ? false : "astronomy-engine not installed (run npm install)";
const min = 60000;

test("lunar quarters and solstice match published times", { skip }, () => {
  const q = A.SearchMoonQuarter(new Date("2026-10-30T18:00:00Z"));
  assert.equal(q.quarter, 3);
  assert.ok(Math.abs(q.time.date - Date.parse("2026-11-01T20:28:00Z")) < 4 * min);
  const n = A.SearchMoonQuarter(new Date("2026-11-02T00:00:00Z"));
  assert.equal(n.quarter, 0);
  assert.ok(Math.abs(n.time.date - Date.parse("2026-11-09T07:02:00Z")) < 4 * min);
  assert.ok(Math.abs(A.Seasons(2026).dec_solstice.date - Date.parse("2026-12-21T20:50:00Z")) < 4 * min);
});

test("earth light time on 2026-10-30 is 495 to 497 s", { skip }, async () => {
  const { helioPosition, distanceAU } = await import("../src/ephemeris.js");
  const { C_AU_S } = await import("../src/data.js");
  const s = distanceAU(helioPosition("Earth", Date.parse("2026-10-30T18:00:00Z"))) / C_AU_S;
  assert.ok(s > 495 && s < 497, String(s));
});

test("moments: great conjunction and venus transit instants", { skip }, () => {
  const sep = (a, b, ms) => {
    const d = new Date(ms);
    const va = A.GeoVector(A.Body[a], d, true);
    const vb = A.GeoVector(A.Body[b], d, true);
    return A.AngleBetween(va, vb);
  };
  const minAt = (a, b, c, span) => {
    let best = c;
    for (let t = c - span; t <= c + span; t += min) if (sep(a, b, t) < sep(a, b, best)) best = t;
    return best;
  };
  assert.ok(Math.abs(minAt("Jupiter", "Saturn", Date.parse("2020-12-21T18:20:00Z"), 8 * 3600000) - Date.parse("2020-12-21T18:20:00Z")) < 60 * min);
  assert.ok(Math.abs(minAt("Venus", "Sun", Date.parse("2012-06-06T01:29:36Z"), 4 * 3600000) - Date.parse("2012-06-06T01:29:36Z")) < 15 * min);
});

test("orbit trails are continuous at both ends of the supported range", { skip }, async () => {
  const { orbitSamples } = await import("../src/ephemeris.js");
  const { orbitWindowStart, MIN_MS, MAX_MS } = await import("../src/timeutil.js");
  const periods = { Mercury: 87.969, Earth: 365.256, Jupiter: 4332.589, Neptune: 60189, Pluto: 90560 };
  for (const [id, days] of Object.entries(periods)) {
    for (const start of [MIN_MS, MAX_MS]) {
      const n = days > 20000 ? 720 : 360;
      const p = orbitSamples(id, orbitWindowStart(start, days), days, n);
      let worst = 0;
      let r = 0;
      for (let i = 0; i < n; i++) r = Math.max(r, Math.hypot(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
      for (let i = 1; i < n; i++) worst = Math.max(worst, Math.hypot(p[i * 3] - p[i * 3 - 3], p[i * 3 + 1] - p[i * 3 - 2], p[i * 3 + 2] - p[i * 3 - 1]));
      assert.ok(worst < 0.05 * r, `${id} ${worst} ${r}`);
    }
  }
});

test("almanac next quarter is correct when time runs backwards inside one bucket", { skip }, async () => {
  const { almanac } = await import("../src/almanac.js");
  const q = Date.parse("2026-11-01T20:28:00Z");
  const after = almanac(q + 22 * min);
  assert.notEqual(after.nextQuarter.name, "Last quarter");
  const before = almanac(q - 28 * min);
  assert.equal(before.nextQuarter.name, "Last quarter");
  assert.ok(Math.abs(before.nextQuarter.ms - q) < 4 * min);
  const forward = almanac(q - 28 * min);
  assert.equal(forward.nextQuarter.name, "Last quarter");
});
