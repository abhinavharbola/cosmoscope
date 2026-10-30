import { PLANETS, SUN, MOON, MOMENTS, ORDER, AU_KM, C_AU_S, SOURCE_FACTS, SOURCE_POSITIONS } from "./data.js";
import { clampMs, distanceAU, separationAU, moonOffset, MIN_MS, MAX_MS } from "./ephemeris.js";
import { createWorld, VIEWS } from "./world.js";
import { almanac } from "./almanac.js";
import { createRuler } from "./ruler.js";
import { createDispatch } from "./dispatch.js";
import { formatDuration, formatRate, formatOffset, fmtNum, formatAU, createClock } from "./format.js";

const $ = (id) => document.getElementById(id);

const ICON = {
  play: '<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z"/></svg>',
  pause: '<svg viewBox="0 0 14 14"><path d="M3 1.5h3v11H3zM8 1.5h3v11H8z"/></svg>',
  reverse: '<svg viewBox="0 0 14 14"><path d="M11 1.5v11L2 7z"/></svg>',
};

const PRESETS = [
  ["Real", 1],
  ["Min", 60],
  ["Hour", 3600],
  ["Day", 86400],
  ["Week", 604800],
  ["Month", 2629800],
  ["Year", 31557600],
  ["Decade", 315576000],
];

const SCALE_MIN = 1;
const SCALE_MAX = 315576000;
const SLIDER_MAX = 1000;

const ALL = { Sun: SUN, Moon: MOON, ...Object.fromEntries(PLANETS.map((p) => [p.id, p])) };

const sim = { ms: Date.now(), scale: 3600, direction: 1, paused: false, tz: "local" };

try {
  const saved = localStorage.getItem("cosmos_tz");
  if (saved === "utc" || saved === "local") sim.tz = saved;
} catch {
  sim.tz = "local";
}

let world;
try {
  world = createWorld($("stage"), $("labels"), {
    onSelect: (id) => focusOn(id),
    onProgress: (done, total, id) => {
      $("intro-line").textContent = `Painting ${id}`;
      $("intro-fill").style.width = `${(done / total) * 100}%`;
    },
  });
} catch (err) {
  const fatal = $("fatal");
  fatal.hidden = false;
  fatal.innerHTML = `<div><div class="intro-mark">Cosmos</div><p>This browser could not start WebGL.<br>Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p></div>`;
  throw err;
}

const ruler = createRuler({
  root: $("ruler"),
  track: $("ruler-track"),
  fill: $("ruler-fill"),
  time: $("ruler-time"),
  scale: $("ruler-scale"),
  last: $("ruler-last"),
});

const dispatch = createDispatch({
  body: $("dispatch-body"),
  badge: $("dispatch-badge"),
  key: $("api-key"),
  save: $("api-save"),
  toggle: $("dispatch-toggle"),
  panel: $("dispatch"),
});

const clock = createClock();
const textCache = new Map();

function setText(el, text) {
  if (textCache.get(el) === text) return;
  textCache.set(el, text);
  el.textContent = text;
}

function setHTML(el, html) {
  if (textCache.get(el) === html) return;
  textCache.set(el, html);
  el.innerHTML = html;
}

function sliderToScale(v) {
  return SCALE_MIN * Math.pow(SCALE_MAX / SCALE_MIN, v / SLIDER_MAX);
}

function scaleToSlider(s) {
  return (Math.log(s / SCALE_MIN) / Math.log(SCALE_MAX / SCALE_MIN)) * SLIDER_MAX;
}

function setScale(s) {
  sim.scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));
  $("scale").value = String(Math.round(scaleToSlider(sim.scale)));
}

function nearestPreset(scale) {
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

function stepScale(dir) {
  if (dir > 0) {
    const next = PRESETS.find(([, s]) => s > sim.scale * 1.02);
    if (next) setScale(next[1]);
    return;
  }
  const lower = PRESETS.filter(([, s]) => s < sim.scale / 1.02);
  if (lower.length) setScale(lower[lower.length - 1][1]);
}

const presetButtons = PRESETS.map(([label, s]) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", () => setScale(s));
  $("presets").appendChild(b);
  return b;
});

$("scale").addEventListener("input", (e) => {
  sim.scale = sliderToScale(parseFloat(e.target.value));
});

function togglePause() {
  sim.paused = !sim.paused;
}

function toggleReverse() {
  sim.direction *= -1;
}

function jumpNow() {
  sim.ms = Date.now();
}

$("btn-reverse").innerHTML = ICON.reverse;
$("btn-play").addEventListener("click", togglePause);
$("btn-reverse").addEventListener("click", toggleReverse);
$("btn-now").addEventListener("click", jumpNow);
$("wordmark").addEventListener("click", () => focusOn("Overview"));

$("clock").addEventListener("click", () => {
  sim.tz = sim.tz === "local" ? "utc" : "local";
  try {
    localStorage.setItem("cosmos_tz", sim.tz);
  } catch {
    return;
  }
});

function inputDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  if (sim.tz === "utc") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseInputDate(v) {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return sim.tz === "utc" ? Date.UTC(y, m - 1, d, 12) : new Date(y, m - 1, d, 12).getTime();
}

$("date-input").addEventListener("change", (e) => {
  const ms = parseInputDate(e.target.value);
  if (Number.isFinite(ms)) sim.ms = clampMs(ms);
});

const menus = [
  { btn: $("btn-jump"), pop: $("jump") },
  { btn: $("btn-view"), pop: $("view") },
];

function closeMenus() {
  menus.forEach((m) => {
    m.pop.hidden = true;
  });
}

menus.forEach((m) => {
  m.btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = m.pop.hidden;
    closeMenus();
    m.pop.hidden = !open;
  });
});

document.addEventListener("click", (e) => {
  menus.forEach((m) => {
    if (!m.pop.hidden && !m.pop.contains(e.target)) m.pop.hidden = true;
  });
});

MOMENTS.forEach((m) => {
  const b = document.createElement("button");
  b.innerHTML = `${m.label}<small>${m.iso.slice(0, 10)}</small>`;
  b.addEventListener("click", () => {
    sim.ms = clampMs(Date.parse(m.iso));
    setScale(m.focus === "Moon" ? 600 : 86400);
    sim.paused = false;
    sim.direction = 1;
    focusOn(m.focus);
    closeMenus();
  });
  $("moments").appendChild(b);
});

const toggles = {
  sizes: $("btn-sizes"),
  orbits: $("btn-orbits"),
  labels: $("btn-labels"),
};

function toggleSizes() {
  world.setTrueScale(!world.state.trueScale);
}

function toggleOrbits() {
  world.state.showOrbits = !world.state.showOrbits;
}

function toggleLabels() {
  world.state.showLabels = !world.state.showLabels;
}

toggles.sizes.addEventListener("click", toggleSizes);
toggles.orbits.addEventListener("click", toggleOrbits);
toggles.labels.addEventListener("click", toggleLabels);

let pulseActive = false;
let pulseStartMs = 0;

function startPulse() {
  if (sim.scale < 30 || sim.scale > 20000) setScale(300);
  sim.paused = false;
  sim.direction = 1;
  ruler.show();
  world.emitPulse(sim.ms);
  pulseStartMs = sim.ms;
  pulseActive = true;
  ruler.log("Light covers 1 AU in 499 s");
}

function stopPulse() {
  world.stopPulse();
  pulseActive = false;
  ruler.hide();
}

function togglePulse() {
  if (pulseActive) stopPulse();
  else startPulse();
}

$("btn-pulse").addEventListener("click", togglePulse);
$("ruler-close").addEventListener("click", stopPulse);

const helpEl = $("help");
function toggleHelp(force) {
  helpEl.hidden = force === undefined ? !helpEl.hidden : !force;
}
$("btn-help").addEventListener("click", () => {
  closeMenus();
  toggleHelp(true);
});
helpEl.addEventListener("click", () => toggleHelp(false));

const navButtons = {};
const navAU = {};

const viewsRow = document.createElement("div");
viewsRow.className = "views";
[
  ["Overview", "System"],
  ["Inner", "Inner"],
].forEach(([id, label]) => {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", () => focusOn(id));
  viewsRow.appendChild(b);
  navButtons[id] = b;
});
$("index").appendChild(viewsRow);

const listEl = document.createElement("div");
listEl.className = "index-list";
$("index").appendChild(listEl);

[...ORDER, "Moon"].forEach((id) => {
  const b = document.createElement("button");
  b.className = "body-row";
  b.innerHTML = `<span>${id}</span><span class="au"></span>`;
  b.addEventListener("click", () => focusOn(id));
  listEl.appendChild(b);
  navButtons[id] = b;
  navAU[id] = b.querySelector(".au");
});

const KEY_MAP = { m: "Moon", i: "Inner", o: "Overview" };
ORDER.forEach((id, i) => {
  KEY_MAP[String(i)] = id;
});

let plateMore = false;

function row(label, value, opts = {}) {
  return `<tr${opts.extra ? ' class="x"' : ""}><td>${label}</td><td${opts.id ? ` id="${opts.id}"` : ""}>${value}</td></tr>`;
}

function renderPlate(id) {
  const plate = $("plate");
  const d = ALL[id];
  if (!d) {
    plate.hidden = true;
    return;
  }
  plate.hidden = false;
  plate.style.animation = "none";
  void plate.offsetWidth;
  plate.style.animation = "";
  plate.scrollTop = 0;
  $("plate-name").textContent = d.name;
  $("plate-type").textContent = d.type;

  const ratio = d.radiusKm / 6371;
  const pct = Math.min(100, Math.max(2, (Math.log(ratio / 0.1) / Math.log(120 / 0.1)) * 100));
  $("meter-fill").style.width = `${pct}%`;
  $("meter-label").textContent = `${fmtNum(ratio, 3)} x Earth's radius`;

  const rows = [];
  if (id !== "Sun") rows.push(row("Distance from Sun", "", { id: "live-sun" }));
  rows.push(row("Mean radius", `${fmtNum(d.radiusKm, 5)} km`));
  rows.push(row("Surface gravity", `${d.gravity.toFixed(1)} m/s<sup>2</sup>`));
  rows.push(row("Rotation", `${fmtNum(Math.abs(d.rotationHours))} h${d.rotationHours < 0 ? " retrograde" : ""}`));
  rows.push(row("Temperature", d.tempLabel));
  if (d.moons !== null && d.moons !== undefined) rows.push(row("Known moons", String(d.moons)));

  if (id !== "Sun" && id !== "Earth") rows.push(row("Distance from Earth", "", { id: "live-earth", extra: true }));
  rows.push(row("Mass", `${fmtNum(d.massE24)} x 10<sup>24</sup> kg`, { extra: true }));
  rows.push(row("Density", `${fmtNum(d.densityKgM3)} kg/m<sup>3</sup>`, { extra: true }));
  if (d.escapeKmS) rows.push(row("Escape velocity", `${d.escapeKmS} km/s`, { extra: true }));
  rows.push(row("Axial tilt", `${d.tiltDeg} deg`, { extra: true }));
  if (d.semiMajorMKm) rows.push(row("Orbit radius", `${fmtNum(d.semiMajorMKm)} million km`, { extra: true }));
  if (d.inclinationDeg !== null && d.inclinationDeg !== undefined) rows.push(row("Inclination", `${d.inclinationDeg} deg`, { extra: true }));
  if (d.eccentricity !== null && d.eccentricity !== undefined) rows.push(row("Eccentricity", `${d.eccentricity}`, { extra: true }));
  if (d.ringSystem !== null && d.ringSystem !== undefined) rows.push(row("Ring system", d.ringSystem ? "Yes" : "No", { extra: true }));
  $("plate-table").innerHTML = rows.join("");
  $("plate-facts").textContent = d.facts;
  applyMore();
  renderSource(id);
}

function applyMore() {
  $("plate").classList.toggle("more", plateMore);
  $("plate-more").textContent = plateMore ? "Less data" : "More data";
}

$("plate-more").addEventListener("click", () => {
  plateMore = !plateMore;
  applyMore();
});

function renderSource(id) {
  const textured = world.state.textured && world.state.textured.has(id);
  $("plate-src").innerHTML =
    `<a href="${SOURCE_FACTS.url}" target="_blank" rel="noopener">NASA NSSDC</a>, ${SOURCE_FACTS.version}. ` +
    `Positions: <a href="${SOURCE_POSITIONS.url}" target="_blank" rel="noopener">${SOURCE_POSITIONS.name}</a>. ` +
    `Surface: ${textured ? "supplied texture" : "procedural"}.`;
}

function focusOn(id) {
  if (!VIEWS[id] && !world.bodies[id]) return;
  world.setFocus(id);
  Object.entries(navButtons).forEach(([k, b]) => b.classList.toggle("active", k === id));
  renderPlate(id);
  document.title = VIEWS[id] ? "Cosmos" : `${id} | Cosmos`;
}

function updateLive() {
  const id = world.state.focus;
  const d = ALL[id];
  if (!d) return;
  const bodies = world.bodies;
  const sunEl = $("live-sun");
  const earthEl = $("live-earth");
  let lightText = "";
  if (id === "Moon") {
    const m = moonOffset(sim.ms);
    const km = Math.hypot(m[0], m[1], m[2]) * AU_KM;
    if (earthEl) setText(earthEl, `${fmtNum(km, 6)} km`);
    if (sunEl) setText(sunEl, `${formatAU(distanceAU(bodies.Earth.pos))} AU`);
    lightText = `Light from Earth takes ${formatDuration(km / 299792.458)} to arrive.`;
  } else if (id !== "Sun") {
    const sunAU = distanceAU(bodies[id].pos);
    if (sunEl) setText(sunEl, `${formatAU(sunAU)} AU`);
    lightText = `Sunlight takes ${formatDuration(sunAU / C_AU_S)} to arrive.`;
    if (id !== "Earth") {
      const eAU = separationAU(bodies[id].pos, bodies.Earth.pos);
      if (earthEl) setText(earthEl, `${formatAU(eAU)} AU`);
      lightText += ` From Earth: ${formatDuration(eAU / C_AU_S)}.`;
    }
  }
  setText($("plate-light"), lightText);
}

function renderClock() {
  const c = clock(sim.ms, sim.tz);
  setText($("clock-date"), c.date);
  setText($("clock-time"), c.time);
  setText($("clock-zone"), c.zone);
  const offset = sim.ms - Date.now();
  const live = !sim.paused && sim.direction > 0 && sim.scale < 1.05 && Math.abs(offset) < 3000;
  const state = $("clock-state");
  let text;
  if (live) text = "Live";
  else if (Math.abs(offset) < 5000 && !sim.paused) text = `Running at ${formatRate(sim.scale).toLowerCase()}`;
  else text = `${sim.paused ? "Paused" : "Simulated"}, ${formatOffset(offset)}`;
  setText(state, text);
  state.classList.toggle("live", live);
  setText($("almanac-title"), Math.abs(offset) < 12 * 3600000 ? "The sky now" : "The sky on this date");
}

function renderAlmanac() {
  const a = almanac(sim.ms);
  const rows = [["Earth", `${a.earthSunAU.toFixed(3)} AU, light ${formatDuration(a.earthSunLightSec)}`]];
  if (a.moonPhase) rows.push(["Moon", `${a.moonPhase}, ${Math.round(a.moonLit * 100)}%`]);
  const events = [a.nextQuarter, a.nextSeason].filter(Boolean).sort((x, y) => x.ms - y.ms);
  if (events.length) rows.push(["Next", `${events[0].name}, ${events[0].date}`]);
  setHTML($("almanac"), rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(""));
}

function renderDock() {
  setText($("rate-readout"), sim.paused ? "Paused" : formatRate(sim.scale));
  const nearest = nearestPreset(sim.scale);
  const exact = Math.abs(Math.log(sim.scale / PRESETS[nearest][1])) < 0.03;
  presetButtons.forEach((b, i) => b.classList.toggle("on", exact && i === nearest));
  $("btn-play").innerHTML = sim.paused ? ICON.play : ICON.pause;
  $("btn-reverse").classList.toggle("active", sim.direction < 0);
  const s = world.state;
  const set = (el, on, label, value) => {
    setHTML(el, `<span>${label}</span><b>${value}</b>`);
    el.classList.toggle("on", on);
  };
  set(toggles.sizes, s.trueScale, "Planet size", s.trueScale ? "True scale" : "Exaggerated");
  set(toggles.orbits, s.showOrbits, "Orbit trails", s.showOrbits ? "On" : "Off");
  set(toggles.labels, s.showLabels, "Labels", s.showLabels ? "On" : "Off");
  const input = $("date-input");
  if (document.activeElement !== input) {
    const iso = inputDate(sim.ms);
    if (input.value !== iso) input.value = iso;
  }
}

function renderIndex() {
  for (const p of PLANETS) setText(navAU[p.id], `${formatAU(distanceAU(world.bodies[p.id].pos))} AU`);
}

window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const k = e.key;
  if (k === "Escape") {
    if (!helpEl.hidden) toggleHelp(false);
    else {
      closeMenus();
      focusOn("Overview");
    }
    return;
  }
  if (k === " ") {
    e.preventDefault();
    togglePause();
    return;
  }
  if (k === "?") return toggleHelp();
  if (k === "[") return stepScale(-1);
  if (k === "]") return stepScale(1);
  const lower = k.toLowerCase();
  if (lower === "r") return toggleReverse();
  if (lower === "n") return jumpNow();
  if (lower === "l") return togglePulse();
  if (lower === "t") return toggleSizes();
  if (lower === "v") return toggleOrbits();
  if (lower === "k") return toggleLabels();
  if (KEY_MAP[lower]) focusOn(KEY_MAP[lower]);
});

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const f = p.get("f");
  const s = parseFloat(p.get("s"));
  const t = Date.parse(p.get("t") || "");
  if (Number.isFinite(t) && t >= MIN_MS && t <= MAX_MS) sim.ms = t;
  if (Number.isFinite(s) && s >= SCALE_MIN && s <= SCALE_MAX) sim.scale = s;
  return f && (VIEWS[f] || world.bodies[f]) ? f : null;
}

let lastHash = "";
function writeHash() {
  const p = new URLSearchParams();
  const f = world.state.focus;
  if (f !== "Overview") p.set("f", f);
  p.set("s", String(Math.round(sim.scale)));
  if (Math.abs(sim.ms - Date.now()) > 120000) p.set("t", new Date(sim.ms).toISOString().slice(0, 19) + "Z");
  const h = p.toString();
  if (h !== lastHash) {
    lastHash = h;
    try {
      history.replaceState(null, "", `#${h}`);
    } catch {
      return;
    }
  }
}

const startFocus = readHash();
setScale(sim.scale);
renderPlate("Overview");
navButtons.Overview.classList.add("active");
if (startFocus && startFocus !== "Overview") focusOn(startFocus);

dispatch.load();

function hideIntro() {
  const intro = $("intro");
  if (!intro) return;
  intro.classList.add("gone");
  setTimeout(() => intro.remove(), 1500);
}

world
  .loadTextures()
  .catch((err) => console.warn("Texture loading failed", err))
  .finally(() => {
    hideIntro();
    const id = world.state.focus;
    if (ALL[id]) renderSource(id);
  });
setTimeout(hideIntro, 25000);

let last = performance.now();
let slowTick = 0;
let hashTick = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (!sim.paused) sim.ms = clampMs(sim.ms + sim.direction * sim.scale * dt * 1000);

  const out = world.update(sim.ms, sim.scale, now);
  out.arrivals.forEach((a) => {
    ruler.log(`<b>${a.name}</b> reached after ${formatDuration(a.seconds)}`);
  });

  if (pulseActive) {
    if (out.pulseRadius === null) {
      pulseActive = false;
      ruler.log("Pulse has left the mapped region");
    } else {
      const distances = {};
      for (const p of PLANETS) distances[p.id] = distanceAU(world.bodies[p.id].pos);
      ruler.update(out.pulseRadius, (sim.ms - pulseStartMs) / 1000, distances);
    }
  }

  renderClock();
  renderDock();

  if (now - slowTick > 400) {
    slowTick = now;
    renderAlmanac();
    renderIndex();
    updateLive();
  }
  if (now - hashTick > 1000) {
    hashTick = now;
    writeHash();
  }

  world.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
