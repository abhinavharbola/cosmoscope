const TWO_PI = Math.PI * 2;

export const FAST_SPIN_RAD_S = 30;
export const CRUISE_SPIN_RAD_S = 0.3;
export const SPIN_BLEND_RATE = 6;

export function wrapAngle(a) {
  return ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
}

export function createSpin() {
  return { angle: 0, offset: 0, fast: false };
}

export function stepSpin(spin, trueAngle, rate, sign, dt) {
  if (rate >= FAST_SPIN_RAD_S) {
    spin.angle = wrapAngle(spin.angle + CRUISE_SPIN_RAD_S * sign * dt);
    spin.fast = true;
    return spin.angle;
  }
  if (trueAngle === null) {
    spin.fast = false;
    return spin.angle;
  }
  if (spin.fast) {
    spin.offset = wrapAngle(spin.angle - trueAngle);
    spin.fast = false;
  }
  spin.offset *= Math.exp(-SPIN_BLEND_RATE * dt);
  spin.angle = trueAngle + spin.offset;
  return spin.angle;
}
