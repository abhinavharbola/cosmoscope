import { MIN_MS, MAX_MS } from "./timeutil.js";

const pad = (n) => String(n).padStart(2, "0");

export function inputDate(ms, tz) {
  const d = new Date(ms);
  if (tz === "utc") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseInputDate(v, tz) {
  const [y, m, d] = String(v).split("-").map(Number);
  if (!y || !m || !d) return NaN;
  const ms = tz === "utc" ? Date.UTC(y, m - 1, d, 12) : new Date(y, m - 1, d, 12).getTime();
  if (!Number.isFinite(ms)) return NaN;
  return Math.min(MAX_MS, Math.max(MIN_MS, ms));
}
