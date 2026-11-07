import { MIN_MS, MAX_MS } from "./timeutil.js";

export const SCALE_MIN = 1;
export const SCALE_MAX = 315576000;
export const SCALE_DEFAULT = 3600;

export function parseHash(hash, isFocus) {
  const p = new URLSearchParams(String(hash).replace(/^#/, ""));
  const f = p.get("f");
  const s = parseFloat(p.get("s"));
  const t = Date.parse(p.get("t") || "");
  return {
    focus: f && isFocus(f) ? f : null,
    scale: Number.isFinite(s) && s >= SCALE_MIN && s <= SCALE_MAX ? s : null,
    ms: Number.isFinite(t) && t >= MIN_MS && t <= MAX_MS ? t : null,
    paused: p.get("p") === "1",
    reverse: p.get("r") === "1",
    trueScale: p.get("z") === "1",
    orbits: p.get("o") !== "0",
    labels: p.get("k") !== "0",
  };
}

export function buildHash(focus, scale, ms, nowMs, flags = {}) {
  const p = new URLSearchParams();
  if (focus !== "Overview") p.set("f", focus);
  const rounded = Number(scale.toPrecision(4));
  p.set("s", String(Math.min(SCALE_MAX, Math.max(SCALE_MIN, rounded))));
  if (Math.abs(ms - nowMs) > 120000) p.set("t", new Date(ms).toISOString().slice(0, 19) + "Z");
  if (flags.paused) p.set("p", "1");
  if (flags.reverse) p.set("r", "1");
  if (flags.trueScale) p.set("z", "1");
  if (flags.orbits === false) p.set("o", "0");
  if (flags.labels === false) p.set("k", "0");
  return p.toString();
}
