import test from "node:test";
import assert from "node:assert/strict";

let A = null;
try {
  A = await import("astronomy-engine");
} catch {
  A = null;
}
const skip = A ? false : "astronomy-engine not installed";

const deg = (rad) => (rad * 180) / Math.PI;
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

test("Greenwich J2000 right ascension equals sidereal time at the J2000 epoch", { skip }, async () => {
  const { greenwichRaRad } = await import("../src/ephemeris.js");
  const ms = Date.UTC(2000, 0, 1, 12);
  const gast = A.SiderealTime(new Date(ms)) * 15;
  assert.ok(Math.abs(wrapDeg(deg(greenwichRaRad(ms)) - gast)) < 0.01);
});

test("the correction for equinox precession grows with distance from J2000", { skip }, async () => {
  const { greenwichRaRad } = await import("../src/ephemeris.js");
  const offset = (ms) => Math.abs(wrapDeg(deg(greenwichRaRad(ms)) - A.SiderealTime(new Date(ms)) * 15));
  const now = offset(Date.UTC(2026, 10, 7));
  const early = offset(Date.UTC(1801, 5, 1));
  const late = offset(Date.UTC(2198, 5, 1));
  assert.ok(now > 0.3 && now < 0.4, String(now));
  assert.ok(early > 2.4 && early < 2.7, String(early));
  assert.ok(late > 2.4 && late < 2.7, String(late));
});
