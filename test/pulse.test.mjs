import test from "node:test";
import assert from "node:assert/strict";
import { crossingSeconds } from "../src/pulse.js";

const C = 1 / 499.0047838;

test("crossing time is interpolated inside the frame", () => {
  const s = crossingSeconds(400, 600, 1, 1, C);
  assert.ok(Math.abs(s - 499.0047838) < 1e-6);
});

test("a planet moving away still yields a time inside the frame", () => {
  const s = crossingSeconds(0, 1000, 1, 1.5, C);
  assert.ok(s >= 0 && s <= 1000);
});

test("a gap that never closes falls back to the frame end", () => {
  assert.equal(crossingSeconds(10, 20, 5, 5, C), 20);
});
