import { MIN_MS, MAX_MS } from "./timeutil.js";

export const SCALE_MIN = 1;
export const SCALE_MAX = 315576000;
export const SCALE_DEFAULT = 3600;

const NUMBER = /^\d+(\.\d+)?([eE][+-]?\d+)?$/;
const VIEW = /^(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/;
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function parseStamp(raw) {
  if (!ISO_STAMP.test(raw)) return NaN;
  const zoned = /(Z|[+-]\d{2}:\d{2})$/.test(raw);
  return Date.parse(raw.includes("T") && !zoned ? `${raw}Z` : raw);
}

function parseView(raw) {
  const m = VIEW.exec(raw || "");
  if (!m) return null;
  const az = Number(m[1]);
  const el = Number(m[2]);
  const logDist = Number(m[3]);
  if (!(az >= -180 && az <= 180 && el >= -90 && el <= 90 && logDist >= -8 && logDist <= 3)) return null;
  return { az, el, logDist };
}

function fixed(x, digits) {
  return String(Number(x.toFixed(digits)));
}

export function parseHash(hash, isFocus) {
  const p = new URLSearchParams(String(hash).replace(/^#/, ""));
  const f = p.get("f");
  const rawS = p.get("s") || "";
  const s = NUMBER.test(rawS) ? parseFloat(rawS) : NaN;
  const rawT = p.get("t") || "";
  const t = parseStamp(rawT);
  return {
    focus: f && isFocus(f) ? f : null,
    scale: Number.isFinite(s) && s >= SCALE_MIN && s <= SCALE_MAX ? s : null,
    ms: Number.isFinite(t) && t >= MIN_MS && t <= MAX_MS ? t : null,
    paused: p.get("p") === "1",
    reverse: p.get("r") === "1",
    trueScale: p.get("z") === "1",
    orbits: p.get("o") !== "0",
    labels: p.get("k") !== "0",
    missions: p.get("m") !== "0",
    view: parseView(p.get("v")),
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
  if (flags.missions === false) p.set("m", "0");
  const v = flags.view;
  if (v && Number.isFinite(v.az) && Number.isFinite(v.el) && Number.isFinite(v.logDist)) {
    p.set("v", `${fixed(v.az, 1)}_${fixed(v.el, 1)}_${fixed(v.logDist, 2)}`);
  }
  return p.toString();
}
