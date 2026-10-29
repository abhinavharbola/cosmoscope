import { PLANETS, SUN, MOON, AU_KM, C_AU_S, SOURCE_FACTS, SOURCE_POSITIONS, NOTE_DATA } from "./data.js";
import { clampMs, distanceAU } from "./ephemeris.js";
import { createWorld } from "./world.js";
import { loadApod, loadNeo, loadFlares, getApiKey, setApiKey } from "./nasa.js";

const $ = (id) => document.getElementById(id);

const world = createWorld($("stage"), $("labels"));

const PRESETS = [
  { label: "Real time", s: 1 },
  { label: "1 s = 1 min", s: 60 },
  { label: "1 s = 1 hr", s: 3600 },
  { label: "1 s = 1 day", s: 86400 },
  { label: "1 s = 1 week", s: 604800 },
  { label: "1 s = 1 month", s: 2629800 },
  { label: "1 s = 1 year", s: 31557600 },
];

const sim = {
  ms: Date.now(),
  scale: 86400,
  direction: 1,
  paused: false,
};

const SLIDER_MAX = 1000;
const SCALE_MIN = 1;
const SCALE_MAX = 31557600 * 10;

function sliderToScale(v) {
  return SCALE_MIN * Math.pow(SCALE_MAX / SCALE_MIN, v / SLIDER_MAX);
}

function scaleToSlider(s) {
  return (Math.log(s / SCALE_MIN) / Math.log(SCALE_MAX / SCALE_MIN)) * SLIDER_MAX;
}

function formatDuration(sec) {
  const s = Math.abs(sec);
  if (s < 1) return `${(s * 1000).toFixed(0)} ms`;
  if (s < 60) return `${s.toFixed(2)} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
  if (s < 86400 * 365.25) return `${(s / 86400).toFixed(2)} days`;
  return `${(s / (86400 * 365.25)).toFixed(2)} years`;
}

function formatScale(s) {
  return `1 s = ${formatDuration(s)}`;
}

function formatDate(ms) {
  const d = new Date(ms);
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

function setScale(s) {
  sim.scale = Math.min(SCALE_MAX, Math.max(SCALE_MIN, s));
  $("scale").value = String(Math.round(scaleToSlider(sim.scale)));
}

const presetsEl = $("presets");
PRESETS.forEach((p) => {
  const b = document.createElement("button");
  b.textContent = p.label;
  b.addEventListener("click", () => setScale(p.s));
  presetsEl.appendChild(b);
});

$("scale").addEventListener("input", (e) => {
  sim.scale = sliderToScale(parseFloat(e.target.value));
});

$("btn-play").addEventListener("click", () => {
  sim.paused = !sim.paused;
  $("btn-play").textContent = sim.paused ? "Play" : "Pause";
});

$("btn-reverse").addEventListener("click", () => {
  sim.direction *= -1;
  $("btn-reverse").classList.toggle("active", sim.direction < 0);
});

$("btn-now").addEventListener("click", () => {
  sim.ms = Date.now();
});

$("btn-sizes").addEventListener("click", () => {
  const next = !world.state.trueScale;
  world.setTrueScale(next);
  $("btn-sizes").textContent = next ? "Sizes: true scale" : "Sizes: exaggerated";
  $("btn-sizes").classList.toggle("active", next);
});

$("btn-orbits").addEventListener("click", () => {
  world.state.showOrbits = !world.state.showOrbits;
  $("btn-orbits").textContent = `Orbits: ${world.state.showOrbits ? "on" : "off"}`;
});

$("btn-labels").addEventListener("click", () => {
  world.state.showLabels = !world.state.showLabels;
  $("btn-labels").textContent = `Labels: ${world.state.showLabels ? "on" : "off"}`;
});

$("btn-overview").addEventListener("click", () => focusOn("Overview"));

$("btn-pulse").addEventListener("click", () => {
  world.emitPulse(sim.ms);
  $("light-log").innerHTML = "";
  logLine("Pulse emitted from the Sun. Light covers 1 AU in 499.0 s.");
});

function logLine(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  const log = $("light-log");
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

const bodiesNav = $("bodies");
const navButtons = {};
function addNav(id, label) {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", () => focusOn(id));
  bodiesNav.appendChild(b);
  navButtons[id] = b;
}
addNav("Overview", "Overview");
addNav("Inner", "Inner system");
addNav("Sun", "Sun");
PLANETS.forEach((p) => addNav(p.id, p.name));
addNav("Moon", "Moon");

function focusOn(id) {
  world.setFocus(id);
  Object.entries(navButtons).forEach(([k, b]) => b.classList.toggle("active", k === id));
  renderInfo(id);
}

const ALL = { Sun: SUN, Moon: MOON, ...Object.fromEntries(PLANETS.map((p) => [p.id, p])) };

function row(k, v) {
  return `<tr><td>${k}</td><td>${v}</td></tr>`;
}

function fmt(n, digits = 2) {
  if (n === null || n === undefined) return "n/a";
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US");
  return Number(n.toPrecision(digits + 1)).toString();
}

function renderInfo(id) {
  const panel = $("info");
  const d = ALL[id];
  if (!d) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("info-name").textContent = d.name;
  $("info-type").textContent = d.type;
  const rows = [
    row("Mean radius", `${fmt(d.radiusKm)} km`),
    row("Mass", `${d.massE24} x 10^24 kg`),
    row("Surface gravity", `${fmt(d.gravity)} m/s^2`),
    row("Density", `${fmt(d.densityKgM3)} kg/m^3`),
    row("Rotation period", `${fmt(Math.abs(d.rotationHours))} h${d.rotationHours < 0 ? " (retrograde)" : ""}`),
    row("Axial tilt", `${d.tiltDeg} deg`),
    row("Temperature", d.tempLabel),
  ];
  if (d.periodDays) rows.push(row("Orbital period", `${fmt(d.periodDays)} days`));
  if (d.semiMajorMKm) rows.push(row("Semi-major axis", `${fmt(d.semiMajorMKm)} million km`));
  if (d.moons !== null && d.moons !== undefined) rows.push(row("Known moons", String(d.moons)));
  $("info-table").innerHTML = rows.join("");
  $("info-facts").textContent = d.facts;
  $("info-src").innerHTML =
    `Facts: <a href="${SOURCE_FACTS.url}" target="_blank" rel="noopener">${SOURCE_FACTS.name}</a>. ` +
    `Positions: <a href="${SOURCE_POSITIONS.url}" target="_blank" rel="noopener">${SOURCE_POSITIONS.name}</a>. ` +
    `Textures: procedural placeholders, not NASA imagery. ${NOTE_DATA}`;
}

function updateLightInfo() {
  const id = world.state.focus;
  const el = $("info-light");
  if (!ALL[id] || id === "Sun") {
    el.textContent = "";
    return;
  }
  let dAU;
  let from = "the Sun";
  let qualifier = "";
  if (id === "Moon") {
    dAU = (MOON.semiMajorMKm * 1e6) / AU_KM;
    from = "Earth";
    qualifier = ", mean distance";
  } else {
    dAU = distanceAU(world.bodies[id].pos);
  }
  el.textContent = `Light from ${from} takes ${formatDuration(dAU / C_AU_S)} to arrive (${dAU.toFixed(dAU < 0.1 ? 5 : 3)} AU${qualifier}).`;
}

async function loadLive() {
  const el = $("live-body");
  const parts = [];
  const results = await Promise.allSettled([loadApod(), loadNeo(), loadFlares()]);
  const [apod, neo, flr] = results;

  if (neo.status === "fulfilled") {
    const n = neo.value.data;
    const c = n.closest;
    parts.push(
      `<div class="item"><b>Near-Earth objects today:</b> ${n.count}` +
        (n.hazardous ? ` (${n.hazardous} flagged potentially hazardous)` : "") +
        (c
          ? `<br><span class="dim">Closest: ${c.name}, ${c.lunarDistance.toFixed(1)} lunar distances, ${c.speedKmS.toFixed(1)} km/s, up to ${Math.round(c.diameterM)} m</span>`
          : "") +
        `</div>`
    );
  }
  if (flr.status === "fulfilled") {
    const f = flr.value.data;
    parts.push(
      `<div class="item"><b>Solar flares, last 14 days:</b> ${f.count}` +
        (f.latest ? `<br><span class="dim">Latest: class ${f.latest.cls} at ${f.latest.peak.replace("T", " ").replace("Z", " UTC")}</span>` : "") +
        `</div>`
    );
  }
  if (apod.status === "fulfilled") {
    const a = apod.value.data;
    const media =
      a.mediaType === "image"
        ? `<img src="${a.url}" alt="${a.title.replace(/"/g, "")}">`
        : `<div class="dim"><a href="${a.url}" target="_blank" rel="noopener">Open media</a></div>`;
    parts.push(
      `<div class="item"><b>Astronomy Picture of the Day:</b> ${a.title}${media}` +
        (a.copyright ? `<span class="dim">Credit: ${a.copyright.trim()}</span>` : `<span class="dim">NASA APOD</span>`) +
        `</div>`
    );
  }
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) {
    parts.push(
      `<div class="item dim">${failed} of 3 NASA feeds failed to load. DEMO_KEY is rate limited; paste your own free key from api.nasa.gov below.</div>`
    );
  }
  el.innerHTML = parts.join("");
}

$("api-key").value = getApiKey() === "DEMO_KEY" ? "" : getApiKey();
$("api-save").addEventListener("click", () => {
  setApiKey($("api-key").value);
  Object.keys(localStorage)
    .filter((k) => k.startsWith("nasa_cache_"))
    .forEach((k) => localStorage.removeItem(k));
  $("live-body").textContent = "Loading NASA feeds...";
  loadLive();
});

world.rebuildOrbits(sim.ms);
setScale(sim.scale);
loadLive();
renderInfo("Overview");
navButtons.Overview.classList.add("active");

let last = performance.now();
let lightInfoTick = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (!sim.paused) {
    sim.ms = clampMs(sim.ms + sim.direction * sim.scale * dt * 1000);
  }

  const out = world.update(sim.ms, sim.scale, now);
  out.arrivals.forEach((a) => {
    logLine(`<b>${a.name}</b> reached after ${formatDuration(a.seconds)} (${a.au.toFixed(3)} AU)`);
  });

  $("hud-date").textContent = formatDate(sim.ms);
  $("hud-scale").textContent = `${sim.paused ? "Paused" : formatScale(sim.scale)}${sim.direction < 0 ? ", reversed" : ""}`;
  $("hud-mode").textContent = world.state.trueScale
    ? "Sizes and Moon distance: true scale"
    : "Sizes and Moon distance: exaggerated. Orbits and planet positions: true";
  const f = world.state.focus;
  $("scale-label").textContent = formatScale(sim.scale);
  $("hud-focus").textContent = `View: ${f === "Inner" ? "Inner system" : f}`;

  if (now - lightInfoTick > 250) {
    updateLightInfo();
    lightInfoTick = now;
  }

  world.render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
