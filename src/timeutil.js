export const MIN_MS = Date.UTC(1801, 0, 1);
export const MAX_MS = Date.UTC(2198, 11, 31);

export function clampMs(ms) {
  const span = MAX_MS - MIN_MS;
  if (ms < MIN_MS) return MAX_MS - ((MIN_MS - ms) % span);
  if (ms > MAX_MS) return MIN_MS + ((ms - MAX_MS) % span);
  return ms;
}

export function orbitWindowStart(startMs, periodDays) {
  const span = periodDays * 86400000;
  if (span >= MAX_MS - MIN_MS) return MIN_MS;
  const ideal = startMs - span / 2;
  return Math.min(Math.max(ideal, MIN_MS), MAX_MS - span);
}
