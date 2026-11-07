import { MIN_MS, MAX_MS } from "./timeutil.js";

export const SCALE_MIN = 1;
export const SCALE_MAX = 315576000;

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
  };
}

export function buildHash(focus, scale, ms, nowMs, flags = {}) {
  const p = new URLSearchParams();
  if (focus !== "Overview") p.set("f", focus);
  p.set("s", String(Number(scale.toPrecision(4))));
  if (Math.abs(ms - nowMs) > 120000) p.set("t", new Date(ms).toISOString().slice(0, 19) + "Z");
  if (flags.paused) p.set("p", "1");
  if (flags.reverse) p.set("r", "1");
  return p.toString();
}
