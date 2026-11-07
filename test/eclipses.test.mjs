import test from "node:test";
import assert from "node:assert/strict";

let A = null;
try {
  A = await import("astronomy-engine");
} catch {
  A = null;
}
const skip = A ? false : "astronomy-engine not installed";

test("next solar eclipse after 2024-04-01 is the 2024-04-08 total", { skip }, async () => {
  const { nextSolarEclipse } = await import("../src/eclipses.js");
  const e = nextSolarEclipse(Date.parse("2024-04-01T00:00:00Z"));
  assert.equal(e.kind, "total");
  assert.ok(Math.abs(e.ms - Date.parse("2024-04-08T18:17:16Z")) < 60000);
});

test("next solar eclipse after the 2024 total is the 2024-10-02 annular", { skip }, async () => {
  const { nextSolarEclipse } = await import("../src/eclipses.js");
  const e = nextSolarEclipse(Date.parse("2024-04-09T00:00:00Z"));
  assert.equal(e.kind, "annular");
});

test("next lunar eclipse after 2024-01-01 is in 2024", { skip }, async () => {
  const { nextLunarEclipse } = await import("../src/eclipses.js");
  const e = nextLunarEclipse(Date.parse("2024-01-01T00:00:00Z"));
  assert.ok(["penumbral", "partial", "total"].includes(e.kind));
  assert.ok(e.ms > Date.parse("2024-01-01T00:00:00Z"));
  assert.ok(e.ms < Date.parse("2025-01-01T00:00:00Z"));
});

test("cache returns the same object while the query stays inside the cached window", { skip }, async () => {
  const { nextSolarEclipse } = await import("../src/eclipses.js");
  const a = nextSolarEclipse(Date.parse("2023-11-01T00:00:00Z"));
  const b = nextSolarEclipse(Date.parse("2023-11-02T00:00:00Z"));
  assert.equal(a, b);
  const c = nextSolarEclipse(a.ms + 86400000);
  assert.notEqual(a, c);
});

test("queries that move backwards in time are not served from a later cache entry", { skip }, async () => {
  const { nextSolarEclipse, nextLunarEclipse } = await import("../src/eclipses.js");
  const later = nextSolarEclipse(Date.parse("2026-11-07T00:00:00Z"));
  assert.ok(later.ms > Date.parse("2026-11-07T00:00:00Z"));
  const earlier = nextSolarEclipse(Date.parse("2017-08-01T00:00:00Z"));
  assert.equal(earlier.kind, "total");
  assert.ok(Math.abs(earlier.ms - Date.parse("2017-08-21T18:25:00Z")) < 600000);
  const again = nextSolarEclipse(Date.parse("2026-11-07T00:00:00Z"));
  assert.equal(again.ms, later.ms);
  const lunarLater = nextLunarEclipse(Date.parse("2026-11-07T00:00:00Z"));
  const lunarEarlier = nextLunarEclipse(Date.parse("2018-01-01T00:00:00Z"));
  assert.ok(lunarEarlier.ms < lunarLater.ms);
  assert.ok(Math.abs(lunarEarlier.ms - Date.parse("2018-01-31T13:30:00Z")) < 3600000);
});

test("a search that starts a few hours before the peak still returns that eclipse", { skip }, async () => {
  const { nextSolarEclipse } = await import("../src/eclipses.js");
  const peak = Date.parse("2024-04-08T18:17:16Z");
  const e = nextSolarEclipse(peak + 1000 - 3 * 3600000);
  assert.ok(Math.abs(e.ms - peak) < 60000);
});
