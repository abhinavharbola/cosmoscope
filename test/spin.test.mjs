import test from "node:test";
import assert from "node:assert/strict";
import { createSpin, stepSpin, wrapAngle, FAST_SPIN_RAD_S } from "../src/spin.js";

const near = (a, b, eps) => Math.abs(wrapAngle(a - b)) < eps;

test("slow rotation follows the true angle exactly", () => {
  const spin = createSpin();
  for (let i = 0; i < 5; i++) {
    const a = stepSpin(spin, 1 + i * 0.1, 0.01, 1, 0.016);
    assert.ok(near(a, 1 + i * 0.1, 1e-9));
  }
});

test("entering fast spin continues from the current angle without a jump", () => {
  const spin = createSpin();
  const before = stepSpin(spin, 2.0, 0.01, 1, 0.016);
  const after = stepSpin(spin, 2.1, FAST_SPIN_RAD_S * 2, 1, 0.016);
  assert.ok(Math.abs(wrapAngle(after - before)) < 0.01);
});

test("leaving fast spin blends back to the true angle", () => {
  const spin = createSpin();
  for (let i = 0; i < 30; i++) stepSpin(spin, 0.5, FAST_SPIN_RAD_S * 2, -1, 0.016);
  const first = stepSpin(spin, 0.5, 0.01, -1, 0.016);
  assert.ok(Math.abs(wrapAngle(first - spin.angle)) < 1e-9);
  let last = first;
  for (let i = 0; i < 400; i++) last = stepSpin(spin, 0.5, 0.01, -1, 0.016);
  assert.ok(near(last, 0.5, 1e-3));
});

test("bodies without a true angle keep their last angle when not fast", () => {
  const spin = createSpin();
  assert.equal(stepSpin(spin, null, 0.01, 1, 0.016), 0);
});
