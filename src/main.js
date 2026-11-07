import { PLANETS, MOONS, MOMENTS, ORDER, INDEX_IDS, BODIES as ALL, AU_KM, C_AU_S, SOURCE_FACTS, SOURCE_POSITIONS } from "./data.js";
import { clampMs, distanceAU, separationAU, moonOffset } from "./ephemeris.js";
import { inputDate, parseInputDate } from "./dates.js";
import { parseHash, buildHash, SCALE_MIN, SCALE_MAX, SCALE_DEFAULT } from "./hash.js";
import { createWorld } from "./world.js";
import { VIEWS } from "./views.js";
import { esc } from "./escape.js";
import { readStore, writeStore } from "./storage.js";
import { almanac } from "./almanac.js";
import { createRuler } from "./ruler.js";
import { createDispatch } from "./dispatch.js";
import { formatDuration, formatRate, formatOffset, fmtNum, formatAU, formatGravity, formatMass, createClock, shortDate } from "./format.js";
import { KIND_LABEL, DEFAULT_SOURCE, groupByKind } from "./missions.js";
import { nextSolarEclipse, nextLunarEclipse } from "./eclipses.js";

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

const SLIDER_MAX = 1000;

const has = (o, k) => Object.hasOwn(o, k);

const sim = { ms: Date.now(), scale: SCALE_DEFAULT, direction: 1, paused: false, tz: "local" };

const savedTz = readStore("cosmos_tz");
if (savedTz === "utc" || savedTz === "local") sim.tz = savedTz;

let world;
try {
  world = createWorld($("stage"), $("labels"), {
    onSelect: (id) => focusOn(id),
    onProgress: (done, total, id) => {
      const line = $("intro-line");
      const fill = $("intro-fill");
      if (!line || !fill) return;
      line.textContent = `Painting ${id}`;
      fill.style.width = `${(done / total) * 100}%`;
    },
  });
} catch (err) {
  if (window.cosmosFatal) {
    window.cosmosFatal(
      "Cosmos could not start the 3D view. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.",
      err && err.message
    );
  }
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

createDispatch({
  body: $("dispatch-body"),
  badge: $("dispatch-badge"),
  key: $("api-key"),
  save: $("api-save"),
  toggle: $("dispatch-toggle"),
  panel: $("dispatch"),
});

const savedTex = readStore("cosmos_tex");
if (savedTex) world.setTextureQuality(savedTex);

const clock = createClock();
const textCache = new WeakMap();

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
  writeStore("cosmos_tz", sim.tz);
  renderClock();
});

$("date-input").addEventListener("change", (e) => {
  const ms = parseInputDate(e.target.value, sim.tz);
  if (Number.isFinite(ms)) sim.ms = ms;
});

const menus = [
  { btn: $("btn-jump"), pop: $("jump") },
  { btn: $("btn-view"), pop: $("view") },
];

function closeMenus() {
  menus.forEach((m) => {
    m.pop.hidden = true;
    m.btn.setAttribute("aria-expanded", "false");
  });
}

function menusOpen() {
  return menus.some((m) => !m.pop.hidden);
}

menus.forEach((m) => {
  m.btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = m.pop.hidden;
    closeMenus();
    m.pop.hidden = !open;
    m.btn.setAttribute("aria-expanded", String(!m.pop.hidden));
  });
});

document.addEventListener("click", (e) => {
  menus.forEach((m) => {
    if (!m.pop.hidden && !m.pop.contains(e.target)) {
      m.pop.hidden = true;
      m.btn.setAttribute("aria-expanded", "false");
    }
  });
});

let restoreTrueScale = null;

MOMENTS.forEach((m) => {
  const b = document.createElement("button");
  b.innerHTML = `${m.label}<small>${m.iso.slice(0, 10)}</small>`;
  b.addEventListener("click", () => {
    sim.ms = clampMs(Date.parse(m.iso));
    setScale(m.scale || 86400);
    sim.paused = false;
    sim.direction = 1;
    if (m.eclipse) {
      if (!world.state.trueScale) {
        restoreTrueScale = false;
        world.setTrueScale(true);
      }
      focusOn(m.focus || "Earth", { eclipse: true });
    } else {
      focusOn(m.focus || "Overview");
    }
    closeMenus();
  });
  $("moments").appendChild(b);
});

const toggles = {
  sizes: $("btn-sizes"),
  orbits: $("btn-orbits"),
  labels: $("btn-labels"),
  quality: $("btn-quality"),
  missions: $("btn-missions"),
};

function cycleQuality() {
  const tiers = world.textureTiers();
  if (tiers.length < 2) return;
  const at = tiers.indexOf(world.state.textureQuality);
  const next = tiers[(at + 1) % tiers.length];
  world.setTextureQuality(next);
  writeStore("cosmos_tex", next);
}

function toggleSizes() {
  restoreTrueScale = null;
  world.setTrueScale(!world.state.trueScale);
}

function toggleOrbits() {
  world.state.showOrbits = !world.state.showOrbits;
}

function toggleLabels() {
  world.state.showLabels = !world.state.showLabels;
}

function toggleMissions() {
  world.state.showMissions = !world.state.showMissions;
}

let diagOn = false;

function renderDiag() {
  const d = world.diagnostics();
  const t = d.textureMs;
  const supplied = Object.entries(world.state.surfaces)
    .map(([id, surface]) => `${id} ${surface.tier}`)
    .join(", ");
  setText(
    $("diag"),
    [
      `${fpsAvg.toFixed(0)} fps`,
      `${d.calls} draw calls, ${Math.round(d.triangles / 1000)}k triangles`,
      `GPU: ${d.gpu}`,
      `Shader fallback: ${d.degraded ? "active" : "no"}`,
      `Textures: ${t === null ? "building" : `${(t / 1000).toFixed(1)} s`}`,
      `Supplied maps: ${supplied || "none"}`,
    ].join("\n")
  );
}

function toggleDiag() {
  diagOn = !diagOn;
  $("diag").hidden = !diagOn;
  if (diagOn) renderDiag();
}

toggles.sizes.addEventListener("click", toggleSizes);
toggles.orbits.addEventListener("click", toggleOrbits);
toggles.labels.addEventListener("click", toggleLabels);
toggles.missions.addEventListener("click", toggleMissions);
toggles.quality.addEventListener("click", cycleQuality);

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
let helpReturn = null;
function toggleHelp(force) {
  const open = force === undefined ? helpEl.hidden : force;
  helpEl.hidden = !open;
  if (open) {
    helpReturn = document.activeElement;
    $("help-card").focus();
  } else if (helpReturn && helpReturn.focus) {
    helpReturn.focus();
    helpReturn = null;
  }
}
helpEl.addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const close = $("help-close");
  if (document.activeElement === close) $("help-card").focus();
  else close.focus();
});
$("help-close").addEventListener("click", () => toggleHelp(false));
$("btn-help").addEventListener("click", () => {
  closeMenus();
  toggleHelp(true);
});
helpEl.addEventListener("click", (e) => {
  if (e.target === helpEl) toggleHelp(false);
});

const navButtons = {};
const navAU = {};
const missionRows = {};

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

INDEX_IDS.forEach((id) => {
  const b = document.createElement("button");
  b.className = has(ALL, id) && ALL[id].parent ? "body-row moon" : "body-row";
  b.innerHTML = `<span>${id}</span><span class="au"></span>`;
  b.addEventListener("click", () => focusOn(id));
  listEl.appendChild(b);
  navButtons[id] = b;
  navAU[id] = b.querySelector(".au");
});

const missionEl = document.createElement("div");
missionEl.className = "index-list mission-list";
missionEl.hidden = true;
$("index").appendChild(missionEl);

function buildMissionIndex(objects) {
  for (const id of Object.keys(missionRows)) {
    delete navButtons[id];
    delete navAU[id];
    delete missionRows[id];
  }
  missionEl.textContent = "";
  missionEl.hidden = objects.length === 0;
  const head = document.createElement("div");
  head.className = "index-head cap";
  head.textContent = "Missions and small bodies";
  if (objects.length) missionEl.appendChild(head);
  for (const group of groupByKind(Object.fromEntries(objects.map((o) => [o.id, o])))) {
    const sub = document.createElement("div");
    sub.className = "index-sub";
    sub.textContent = group.label === "Asteroid" ? "Asteroids" : group.label === "Comet" ? "Comets" : group.label;
    missionEl.appendChild(sub);
    for (const o of group.items) {
      const b = document.createElement("button");
      b.className = "body-row craft";
      const name = document.createElement("span");
      name.textContent = o.name;
      const au = document.createElement("span");
      au.className = "au";
      b.append(name, au);
      b.addEventListener("click", () => focusOn(o.id));
      missionEl.appendChild(b);
      navButtons[o.id] = b;
      navAU[o.id] = au;
      missionRows[o.id] = b;
    }
  }
  const id = world.state.focus;
  if (navButtons[id]) navButtons[id].classList.add("active");
}

const KEY_MAP = { m: "Moon", i: "Inner", o: "Overview" };
ORDER.forEach((id, i) => {
  KEY_MAP[String(i)] = id;
});

let plateMore = false;

function row(label, value, opts = {}) {
  return `<tr${opts.extra ? ' class="x"' : ""}><td>${label}</td><td${opts.id ? ` id="${opts.id}"` : ""}>${value}</td></tr>`;
}

function renderCraftPlate(id) {
  const plate = $("plate");
  const cr = world.craft[id];
  const d = cr.data;
  plate.hidden = false;
  plate.style.animation = "none";
  void plate.offsetWidth;
  plate.style.animation = "";
  plate.scrollTop = 0;
  $("plate-name").textContent = d.name;
  $("plate-type").textContent = d.launch ? `${KIND_LABEL[d.kind]}, launched ${d.launch}` : KIND_LABEL[d.kind];
  plate.querySelector(".meter-wrap").hidden = true;
  setText($("plate-light"), "");
  const rows = [
    row("Status", "", { id: "live-status" }),
    row("Distance from Sun", "", { id: "live-sun" }),
    row("Distance from Earth", "", { id: "live-earth" }),
    row("Speed around the Sun", "", { id: "live-speed" }),
    row("Data window", `${shortDate(cr.track.startMs)} to ${shortDate(cr.track.endMs)}`, { extra: true }),
    row("Stored samples", String(cr.track.count), { extra: true }),
  ];
  if (d.errorAU !== null) rows.push(row("Interpolation error", `under ${fmtNum(d.errorAU * AU_KM, 2)} km`, { extra: true }));
  if (d.target) rows.push(row("Horizons target", esc(d.target), { extra: true }));
  rows.push(row("Position model", "Interpolated JPL trajectory", { extra: true }));
  $("plate-table").innerHTML = rows.join("");
  $("plate-facts").textContent = d.facts || "";
  applyMore();
  renderCraftSource(id);
}

function renderCraftSource(id) {
  const cr = world.craft[id];
  if (!cr) return;
  const src = world.state.missionSource || DEFAULT_SOURCE;
  const gen = world.state.missionGenerated;
  setHTML(
    $("plate-src"),
    `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.name)}</a>${gen ? `, retrieved ${esc(shortDate(gen))}` : ""}. ` +
      `Positions are interpolated between ${cr.track.count} stored samples and are not a live feed. ` +
      (src.citation ? `Cite: ${esc(src.citation)}.` : "")
  );
}

function updateCraftLive(id) {
  const cr = world.craft[id];
  if (!cr) return;
  const earth = world.bodies.Earth;
  const out = (name, text) => {
    const el = $(name);
    if (el) setText(el, text);
  };
  if (!cr.active) {
    out("live-status", sim.ms < cr.track.startMs ? "Before the data window" : "After the data window");
    out("live-sun", "n/a");
    out("live-earth", "n/a");
    out("live-speed", "n/a");
    setText($("plate-light"), "No trajectory data for this date.");
    return;
  }
  const sunAU = distanceAU(cr.pos);
  const earthAU = separationAU(cr.pos, earth.pos);
  out("live-status", "Tracked");
  out("live-sun", `${formatAU(sunAU)} AU`);
  out("live-earth", `${formatAU(earthAU)} AU`);
  out("live-speed", `${fmtNum(cr.track.speedKmS(sim.ms), 4)} km/s`);
  setText(
    $("plate-light"),
    `Sunlight takes ${formatDuration(sunAU / C_AU_S)} to arrive. A signal to Earth takes ${formatDuration(earthAU / C_AU_S)}.`
  );
}

function renderPlate(id) {
  const plate = $("plate");
  if (has(world.craft, id)) {
    renderCraftPlate(id);
    return;
  }
  plate.querySelector(".meter-wrap").hidden = false;
  setText($("plate-light"), "");
  const d = has(ALL, id) ? ALL[id] : null;
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
  rows.push(row("Surface gravity", `${formatGravity(d.gravity)} m/s<sup>2</sup>`));
  rows.push(row("Rotation", `${fmtNum(Math.abs(d.rotationHours))} h${d.rotationHours < 0 ? " retrograde" : ""}`));
  rows.push(row("Temperature", d.tempLabel));
  if (d.moons !== null && d.moons !== undefined) rows.push(row("Known moons", String(d.moons)));

  if (id !== "Sun" && id !== "Earth") rows.push(row("Distance from Earth", "", { id: "live-earth", extra: true }));
  rows.push(row("Mass", formatMass(d.massE24), { extra: true }));
  rows.push(row("Density", `${fmtNum(d.densityKgM3)} kg/m<sup>3</sup>`, { extra: true }));
  if (d.escapeKmS) rows.push(row("Escape velocity", `${d.escapeKmS} km/s`, { extra: true }));
  if (d.tiltDeg !== null && d.tiltDeg !== undefined) rows.push(row("Axial tilt", `${d.tiltDeg} deg`, { extra: true }));
  if (d.semiMajorMKm !== null && d.semiMajorMKm !== undefined) {
    rows.push(row("Orbit radius", `${fmtNum(d.semiMajorMKm)} million km`, { extra: true }));
  } else if (d.semiMajorKm !== undefined) {
    rows.push(row("Orbit radius", `${fmtNum(d.semiMajorKm)} km`, { extra: true }));
  }
  const modelled = d.source !== "keplerian";
  if (modelled && d.inclinationDeg !== null && d.inclinationDeg !== undefined) rows.push(row("Inclination", `${d.inclinationDeg} deg`, { extra: true }));
  if (modelled && d.eccentricity !== null && d.eccentricity !== undefined) rows.push(row("Eccentricity", `${d.eccentricity}`, { extra: true }));
  if (d.ringSystem !== null && d.ringSystem !== undefined) rows.push(row("Ring system", d.ringSystem ? "Yes" : "No", { extra: true }));
  if (d.parent) rows.push(row("Position model", d.source === "keplerian" ? "Circular approximation" : "Ephemeris", { extra: true }));
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

function surfaceHTML(id) {
  const surface = Object.hasOwn(world.state.surfaces, id) ? world.state.surfaces[id] : null;
  if (!surface) return "Surface: procedural, not a photograph.";
  const name = esc(surface.credit || "supplied texture");
  const credit = surface.url ? `<a href="${esc(surface.url)}" target="_blank" rel="noopener">${name}</a>` : name;
  const parts = [credit];
  if (surface.license) parts.push(esc(surface.license));
  parts.push(`${esc(surface.tier)} map`);
  let html = `Surface: ${parts.join(", ")}.`;
  if (surface.note) html += ` ${esc(surface.note)}`;
  return html;
}

function renderSource(id) {
  setHTML(
    $("plate-src"),
    `<a href="${SOURCE_FACTS.url}" target="_blank" rel="noopener">NASA NSSDC</a>, ${SOURCE_FACTS.version}. ` +
      `Positions: <a href="${SOURCE_POSITIONS.url}" target="_blank" rel="noopener">${SOURCE_POSITIONS.name}</a>. ` +
      surfaceHTML(id)
  );
}

function focusOn(id, options = {}) {
  if (!has(VIEWS, id) && !has(world.bodies, id) && !has(world.craft, id)) return;
  if (!options.eclipse && restoreTrueScale !== null) {
    world.setTrueScale(restoreTrueScale);
    restoreTrueScale = null;
  }
  world.setFocus(id, options);
  Object.entries(navButtons).forEach(([k, b]) => b.classList.toggle("active", k === id));
  renderPlate(id);
  document.title = has(VIEWS, id) ? "Cosmos" : `${has(world.craft, id) ? world.craft[id].data.name : id} | Cosmos`;
  syncFlight();
}

let flightFlag = "";
function syncFlight() {
  const v = world.state.trans ? "1" : "0";
  if (v === flightFlag) return;
  flightFlag = v;
  document.body.setAttribute("data-flying", v);
}

function updateLive() {
  const id = world.state.focus;
  if (has(world.craft, id)) {
    updateCraftLive(id);
    return;
  }
  const d = has(ALL, id) ? ALL[id] : null;
  if (!d) return;
  if (id === "Sun") {
    setText($("plate-light"), "");
    return;
  }
  const bodies = world.bodies;
  const sunEl = $("live-sun");
  const earthEl = $("live-earth");
  const centerId = d.parent || id;
  const centerBody = bodies[centerId];
  if (!centerBody) return;
  const sunAU = distanceAU(centerBody.pos);
  if (sunEl) setText(sunEl, `${formatAU(sunAU)} AU`);
  let lightText = `Sunlight takes ${formatDuration(sunAU / C_AU_S)} to arrive.`;

  if (id !== "Earth") {
    let eAU;
    if (d.parent) {
      const off = moonOffset(id, sim.ms);
      eAU = separationAU(
        [centerBody.pos[0] + off[0], centerBody.pos[1] + off[1], centerBody.pos[2] + off[2]],
        bodies.Earth.pos
      );
    } else {
      eAU = separationAU(centerBody.pos, bodies.Earth.pos);
    }
    if (earthEl) {
      if (d.parent === "Earth") setText(earthEl, `${fmtNum(eAU * AU_KM, 6)} km`);
      else setText(earthEl, `${formatAU(eAU)} AU`);
    }
    lightText += ` From Earth: ${formatDuration(eAU / C_AU_S)}.`;
  }

  let note = "";
  if (id === "Earth") {
    const s = nextSolarEclipse(sim.ms - 3 * 3600000);
    if (s && Math.abs(s.ms - sim.ms) < 3 * 3600000) note = `${s.kind} solar eclipse.`;
  } else if (id === "Moon") {
    const l = nextLunarEclipse(sim.ms - 3 * 3600000);
    if (l && Math.abs(l.ms - sim.ms) < 3 * 3600000) note = `${l.kind} lunar eclipse.`;
  }
  setText($("plate-light"), note ? `${lightText} ${note}` : lightText);
}

function isLive() {
  return !sim.paused && sim.direction > 0 && sim.scale < 1.05 && Math.abs(sim.ms - Date.now()) < 3000;
}

function renderClock() {
  const c = clock(sim.ms, sim.tz);
  setText($("clock-date"), c.date);
  setText($("clock-time"), c.time);
  setText($("clock-zone"), c.zone);
  const offset = sim.ms - Date.now();
  const live = isLive();
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
  if (a.nextSolar) rows.push(["Solar", `${a.nextSolar.kind}, ${a.nextSolar.date}`]);
  if (a.nextLunar) rows.push(["Lunar", `${a.nextLunar.kind}, ${a.nextLunar.date}`]);
  if (a.nextQuarter) rows.push(["Phase", `${a.nextQuarter.name}, ${a.nextQuarter.date}`]);
  if (a.nextSeason) rows.push(["Season", `${a.nextSeason.name}, ${a.nextSeason.date}`]);
  setHTML($("almanac"), rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(""));
}

function renderDock() {
  setText($("rate-readout"), sim.paused ? "Paused" : formatRate(sim.scale));
  const nearest = nearestPreset(sim.scale);
  const exact = Math.abs(Math.log(sim.scale / PRESETS[nearest][1])) < 0.03;
  presetButtons.forEach((b, i) => b.classList.toggle("on", exact && i === nearest));
  setHTML($("btn-play"), sim.paused ? ICON.play : ICON.pause);
  $("btn-reverse").classList.toggle("active", sim.direction < 0);
  const s = world.state;
  const set = (el, on, label, value) => {
    setHTML(el, `<span>${label}</span><b>${value}</b>`);
    el.classList.toggle("on", on);
  };
  set(toggles.sizes, s.trueScale, "Planet size", s.trueScale ? "True scale" : "Exaggerated");
  set(toggles.orbits, s.showOrbits, "Orbit trails", s.showOrbits ? "On" : "Off");
  set(toggles.labels, s.showLabels, "Labels", s.showLabels ? "On" : "Off");
  const haveMissions = Object.keys(world.craft).length > 0;
  toggles.missions.hidden = !haveMissions;
  if (haveMissions) set(toggles.missions, s.showMissions, "Missions and small bodies", s.showMissions ? "On" : "Off");
  const tiers = world.textureTiers();
  toggles.quality.hidden = tiers.length < 2;
  if (tiers.length > 1) set(toggles.quality, s.textureQuality !== "2k", "Texture detail", s.textureQuality);
  const input = $("date-input");
  if (document.activeElement !== input) {
    const iso = inputDate(sim.ms, sim.tz);
    if (input.value !== iso) input.value = iso;
  }
}

function renderIndex() {
  for (const p of PLANETS) setText(navAU[p.id], `${formatAU(distanceAU(world.bodies[p.id].pos))} AU`);
  for (const m of MOONS) {
    const parent = world.bodies[m.parent];
    if (parent) setText(navAU[m.id], `${formatAU(distanceAU(parent.pos))} AU`);
  }
  for (const id of Object.keys(world.craft)) {
    const cr = world.craft[id];
    if (navAU[id]) setText(navAU[id], cr.active ? `${formatAU(distanceAU(cr.pos))} AU` : "no data");
  }
}

document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest && e.target.closest("#index button, #presets button, #labels button");
  if (b && e.detail > 0) b.blur();
});

window.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  const k = e.key;
  if (k === "Escape") {
    if (!helpEl.hidden) toggleHelp(false);
    else if (menusOpen()) closeMenus();
    else focusOn("Overview");
    return;
  }
  if (e.repeat) return;
  if (!helpEl.hidden) {
    if (k === "?") toggleHelp(false);
    return;
  }
  if (k === " ") {
    if (tag === "BUTTON") return;
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
  if (lower === "d") return toggleDiag();
  if (has(KEY_MAP, lower)) focusOn(KEY_MAP[lower]);
});

window.addEventListener("keyup", (e) => {
  const tag = e.target && e.target.tagName;
  if (e.key === " " && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "BUTTON") e.preventDefault();
});

function readHash(fromChange = false) {
  const h = parseHash(location.hash, (f) => has(VIEWS, f) || has(world.bodies, f) || has(world.craft, f));
  if (h.ms !== null) sim.ms = h.ms;
  else if (fromChange) sim.ms = Date.now();
  sim.scale = h.scale !== null ? h.scale : SCALE_DEFAULT;
  sim.paused = h.paused;
  sim.direction = h.reverse ? -1 : 1;
  if (world.state.trueScale !== h.trueScale) {
    restoreTrueScale = null;
    world.setTrueScale(h.trueScale);
  }
  world.state.showOrbits = h.orbits;
  world.state.showLabels = h.labels;
  world.state.showMissions = h.missions;
  return h.focus;
}

let lastHash = "";
function writeHash() {
  const h = buildHash(world.state.focus, sim.scale, sim.ms, Date.now(), {
    paused: sim.paused,
    reverse: sim.direction < 0,
    trueScale: world.state.trueScale,
    orbits: world.state.showOrbits,
    labels: world.state.showLabels,
    missions: world.state.showMissions,
  });
  if (pendingFocus) return;
  if (h !== lastHash) {
    lastHash = h;
    try {
      history.replaceState(null, "", `#${h}`);
    } catch {
      lastHash = "";
    }
  }
}

window.addEventListener("hashchange", () => {
  if (location.hash.replace(/^#/, "") === lastHash) return;
  const focus = readHash(true);
  setScale(sim.scale);
  focusOn(focus || "Overview");
});

let pendingFocus = null;
const startFocus = readHash();
if (!startFocus) {
  const wanted = new URLSearchParams(location.hash.replace(/^#/, "")).get("f");
  if (wanted && /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(wanted) && !has(VIEWS, wanted) && !has(world.bodies, wanted)) pendingFocus = wanted;
}
setScale(sim.scale);
renderPlate("Overview");
navButtons.Overview.classList.add("active");
if (startFocus && startFocus !== "Overview") focusOn(startFocus);


function hideIntro() {
  const intro = $("intro");
  if (!intro) return;
  intro.classList.add("gone");
  setTimeout(() => intro.remove(), 1500);
}

world
  .loadMissions()
  .then((list) => {
    buildMissionIndex(list);
    if (pendingFocus && has(world.craft, pendingFocus) && world.state.focus === "Overview") focusOn(pendingFocus);
  })
  .catch((err) => console.warn("Missions index failed", err))
  .finally(() => {
    pendingFocus = null;
  });

world
  .loadTextures()
  .catch((err) => console.warn("Texture loading failed", err))
  .finally(() => {
    hideIntro();
    const id = world.state.focus;
    if (has(ALL, id)) renderSource(id);
  });
setTimeout(hideIntro, 25000);

let last = performance.now();
let fpsAvg = 60;
let slowTick = 0;
let hashTick = 0;
let clockTick = 0;
let liveBefore = false;
let lastStepMs = null;

function step(now) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.1, rawDt);
  last = now;
  if (rawDt > 0) fpsAvg += (1 / rawDt - fpsAvg) * 0.05;

  const tracking = liveBefore && sim.ms === lastStepMs && !sim.paused && sim.direction > 0 && sim.scale < 1.05;
  if (!sim.paused) {
    const next = tracking ? Date.now() : sim.ms + sim.direction * sim.scale * dt * 1000;
    const wrapped = clampMs(next);
    if (wrapped !== next && pulseActive) {
      world.stopPulse();
      pulseActive = false;
      ruler.log("Pulse stopped because the clock wrapped");
    }
    sim.ms = wrapped;
  }
  liveBefore = isLive();
  lastStepMs = sim.ms;

  const out = world.update(sim.ms, sim.paused ? 0 : sim.scale * sim.direction, now);
  out.arrivals.forEach((a) => {
    ruler.log(`<b>${a.name}</b> reached after ${formatDuration(a.seconds)}`);
  });

  if (pulseActive) {
    if (out.pulseRadius === null) {
      pulseActive = false;
      ruler.log(out.pulseEnd === "reversed" ? "Pulse stopped because time ran backwards" : "Pulse has left the mapped region");
    } else {
      const distances = {};
      for (const p of PLANETS) distances[p.id] = distanceAU(world.bodies[p.id].pos);
      ruler.update(out.pulseRadius, (sim.ms - pulseStartMs) / 1000, distances);
    }
  }

  if (now - clockTick > 80) {
    clockTick = now;
    renderClock();
  }
  renderDock();

  if (now - slowTick > 400) {
    slowTick = now;
    renderAlmanac();
    renderIndex();
    updateLive();
    if (has(ALL, world.state.focus)) renderSource(world.state.focus);
    else if (has(world.craft, world.state.focus)) renderCraftSource(world.state.focus);
    if (diagOn) renderDiag();
  }
  if (now - hashTick > 1000) {
    hashTick = now;
    writeHash();
  }

  syncFlight();
  world.render();
}

let frameErrors = 0;

function frame(now) {
  try {
    step(now);
    frameErrors = 0;
    window.cosmosReady = true;
  } catch (err) {
    frameErrors += 1;
    console.error(err);
    if (frameErrors >= 30) {
      if (window.cosmosFatal) window.cosmosFatal("Cosmos stopped because of a repeated error.", err && err.message);
      return;
    }
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
