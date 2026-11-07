export function crossingSeconds(prevElapsed, elapsed, prevDistance, distance, speedAUs) {
  const f0 = prevElapsed * speedAUs - prevDistance;
  const f1 = elapsed * speedAUs - distance;
  const frac = f1 - f0 > 0 ? Math.min(1, Math.max(0, -f0 / (f1 - f0))) : 1;
  return prevElapsed + frac * (elapsed - prevElapsed);
}
