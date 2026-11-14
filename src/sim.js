import { SCALE_MIN, SCALE_MAX, SCALE_DEFAULT } from "./hash.js";
import { readStore } from "./storage.js";
import { $ } from "./dom.js";

export const PRESETS = [
  ["Real", 1],
  ["Min", 60],
  ["Hour", 3600],
  ["Day", 86400],
  ["Week", 604800],
  ["Month", 2629800],
  ["Year", 31557600],
  ["Decade", 315576000],
];

export const SLIDER_MAX = 1000;

export const sim = { ms: Date.now(), scale: SCALE_DEFAULT, direction: 1, paused: false, tz: "local" };

const savedTz = readStore("cosmos_tz");
if (savedTz === "utc" || savedTz === "local") sim.tz = savedTz;

export function sliderToScale(v) {
  return SCALE_MIN * Math.pow(SCALE_MAX / SCALE_MIN, v / SLIDER_MAX);
}

export function scaleToSlider(s) {
  return (Math.log(s / SCALE_MIN) / Math.log(SCALE_MAX / SCALE_MIN)) * SLIDER_MAX;
}

export function setScale(s) {
  sim.scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));
  $("scale").value = String(Math.round(scaleToSlider(sim.scale)));
}

export function nearestPreset(scale) {
  let best = 0;
  let bestD = Infinity;
  PRESETS.forEach(([, s], i) => {
    const d = Math.abs(Math.log(scale / s));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export function stepScale(dir) {
  if (dir > 0) {
    const next = PRESETS.find(([, s]) => s > sim.scale * 1.02);
    if (next) setScale(next[1]);
    return;
  }
  const lower = PRESETS.filter(([, s]) => s < sim.scale / 1.02);
  if (lower.length) setScale(lower[lower.length - 1][1]);
}

export function togglePause() {
  sim.paused = !sim.paused;
}

export function toggleReverse() {
  sim.direction *= -1;
}

export function jumpNow() {
  sim.ms = Date.now();
}

export function isLive() {
  return !sim.paused && sim.direction > 0 && sim.scale < 1.05 && Math.abs(sim.ms - Date.now()) < 3000;
}
