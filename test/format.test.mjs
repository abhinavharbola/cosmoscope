import test from "node:test";
import assert from "node:assert/strict";
import { formatUnit, formatMass, formatGravity, fmtNum } from "../src/format.js";

test("formatUnit never prints a unit boundary value", () => {
  assert.equal(formatUnit(59), "59 s");
  assert.equal(formatUnit(59.6), "1 min");
  assert.equal(formatUnit(3599), "1 hr");
  assert.equal(formatUnit(86399), "1 day");
  assert.equal(formatUnit(86400 * 7 - 1), "1 week");
  assert.equal(formatUnit(86400 * 29.99), "1 month");
  assert.equal(formatUnit(86400 * 364), "1 year");
  assert.equal(formatUnit(86400 * 90), "3 months");
  assert.equal(formatUnit(31557600 * 10), "10 years");
});

test("fmtNum avoids exponent notation for ordinary small values", () => {
  assert.equal(fmtNum(0.0057, 2), "0.0057");
  assert.equal(fmtNum(0.000123, 3), "0.000123");
  assert.equal(fmtNum(null), "n/a");
  assert.equal(fmtNum(12345.6), "12,346");
});

test("formatGravity keeps precision for small bodies", () => {
  assert.equal(formatGravity(24.79), "24.8");
  assert.equal(formatGravity(1.62), "1.6");
  assert.equal(formatGravity(0.0057), "0.0057");
  assert.equal(formatGravity(0.003), "0.003");
});

test("formatMass switches to kilograms for small moons", () => {
  assert.equal(formatMass(5.972), "5.972 x 10<sup>24</sup> kg");
  assert.equal(formatMass(1.0659e-8), "1.066 x 10<sup>16</sup> kg");
  assert.equal(formatMass(1.5e-9), "1.5 x 10<sup>15</sup> kg");
  assert.equal(formatMass(undefined), "n/a");
});

test("formatMass uses a normal exponent for the Sun", () => {
  assert.equal(formatMass(1988400), "1.988 x 10<sup>30</sup> kg");
  assert.equal(formatMass(1898), "1898 x 10<sup>24</sup> kg");
});
