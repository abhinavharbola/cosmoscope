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

test("cache returns the same object until time passes the peak", { skip }, async () => {
  const { nextSolarEclipse } = await import("../src/eclipses.js");
  const a = nextSolarEclipse(Date.parse("2024-01-01T00:00:00Z"));
  const b = nextSolarEclipse(Date.parse("2024-01-02T00:00:00Z"));
  assert.equal(a, b);
  const c = nextSolarEclipse(Date.parse("2024-04-09T00:00:00Z"));
  assert.notEqual(a, c);
});