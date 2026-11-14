import { PLANETS, MOMENTS, BODIES as ALL } from "./data.js";
import { clampMs, distanceAU } from "./ephemeris.js";
import { createWorld } from "./world.js";
import { VIEWS } from "./views.js";
import { readStore } from "./storage.js";
import { createRuler } from "./ruler.js";
import { createDispatch } from "./dispatch.js";
import { formatDuration } from "./format.js";
import { $, has } from "./dom.js";
import { sim, setScale, isLive } from "./sim.js";
import { createDialog } from "./dialog.js";
import { createViewControls } from "./viewctl.js";
import { createDiag } from "./diag.js";
import { createMenus } from "./menus.js";
import { createPulseControl } from "./pulsectl.js";
import { createNav } from "./nav.js";
import { createPlate } from "./plate.js";
import { createDock } from "./dock.js";
import { createTours } from "./tours.js";
import { createHint } from "./hint.js";
import { createHashSync } from "./hashsync.js";
import { installKeys } from "./keys.js";

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

const viewCtl = createViewControls(world);
const diag = createDiag(world);
const menus = createMenus();
const nav = createNav(world, focusOn);
const plate = createPlate(world);
const dock = createDock({ world, focusOn, viewCtl });
const pulseCtl = createPulseControl(world, ruler);
const help = createDialog($("help"), $("help-card"), $("help-close"));
const about = createDialog($("about"), $("about-card"), $("about-close"));
const hint = createHint();
const sync = createHashSync({ world, focusOn, viewCtl });

function goTo(step) {
  if (step.when === "now") sim.ms = Date.now();
  else if (step.when) sim.ms = clampMs(Date.parse(step.when));
  if (step.scale) setScale(step.scale);
  sim.paused = false;
  sim.direction = 1;
  if (step.eclipse) {
    viewCtl.beginEclipse();
    focusOn(step.focus, { eclipse: true });
  } else {
    focusOn(step.focus);
  }
}

const tours = createTours({ goTo, closeMenus: menus.close });

MOMENTS.forEach((m) => {
  const b = document.createElement("button");
  b.innerHTML = `${m.label}<small>${m.iso.slice(0, 10)}</small>`;
  b.addEventListener("click", () => {
    goTo({
      when: m.iso,
      scale: m.scale || 86400,
      eclipse: !!m.eclipse,
      focus: m.focus || (m.eclipse ? "Earth" : "Overview"),
    });
    menus.close();
  });
  $("moments").appendChild(b);
});

$("btn-help").addEventListener("click", () => {
  menus.close();
  help.toggle(true);
});

$("btn-about").addEventListener("click", () => {
  menus.close();
  about.toggle(true);
});

$("btn-pulse").addEventListener("click", pulseCtl.toggle);
$("ruler-close").addEventListener("click", pulseCtl.stop);

installKeys({ focusOn, menus, help, about, tours, pulseCtl, viewCtl, diag });

function focusOn(id, options = {}) {
  if (!has(VIEWS, id) && !has(world.bodies, id) && !has(world.craft, id)) return;
  if (!options.eclipse) viewCtl.settleScale();
  world.setFocus(id, options);
  nav.setActive(id);
  plate.renderPlate(id);
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

const start = sync.start();
setScale(sim.scale);
plate.renderPlate("Overview");
nav.setActive("Overview");
if (start.focus && start.focus !== "Overview") focusOn(start.focus);
sync.applyView(start);

function hideIntro() {
  const intro = $("intro");
  if (!intro) return;
  intro.classList.add("gone");
  setTimeout(() => intro.remove(), 1500);
  hint.show();
}

world
  .loadMissions()
  .then((list) => {
    nav.buildMissionIndex(list);
    const wanted = sync.pending();
    if (wanted && has(world.craft, wanted) && world.state.focus === "Overview") focusOn(wanted);
  })
  .catch((err) => console.warn("Missions index failed", err))
  .finally(() => {
    sync.clearPending();
  });

world
  .loadTextures()
  .catch((err) => console.warn("Texture loading failed", err))
  .finally(() => {
    hideIntro();
    const id = world.state.focus;
    if (has(ALL, id)) plate.renderSource(id);
  });
setTimeout(hideIntro, 25000);

let last = performance.now();
let slowTick = 0;
let hashTick = 0;
let clockTick = 0;
let fpsAvg = 60;
let liveBefore = false;
let lastStepMs = null;

function step(now) {
  const rawDt = (now - last) / 1000;
  const dt = Math.min(0.1, rawDt);
  last = now;
  if (rawDt > 0) fpsAvg += (1 / rawDt - fpsAvg) * 0.05;
  diag.setFps(fpsAvg);

  const tracking = liveBefore && sim.ms === lastStepMs && !sim.paused && sim.direction > 0 && sim.scale < 1.05;
  if (!sim.paused) {
    const next = tracking ? Date.now() : sim.ms + sim.direction * sim.scale * dt * 1000;
    const wrapped = clampMs(next);
    if (wrapped !== next && pulseCtl.pulse.active) {
      world.stopPulse();
      pulseCtl.pulse.active = false;
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

  if (pulseCtl.pulse.active) {
    if (out.pulseRadius === null) {
      pulseCtl.pulse.active = false;
      ruler.log(out.pulseEnd === "reversed" ? "Pulse stopped because time ran backwards" : "Pulse has left the mapped region");
    } else {
      const distances = {};
      for (const p of PLANETS) distances[p.id] = distanceAU(world.bodies[p.id].pos);
      ruler.update(out.pulseRadius, (sim.ms - pulseCtl.pulse.startMs) / 1000, distances);
    }
  }

  if (now - clockTick > 80) {
    clockTick = now;
    dock.renderClock();
  }
  dock.renderDock();

  if (now - slowTick > 400) {
    slowTick = now;
    dock.renderAlmanac();
    nav.renderIndex();
    plate.updateLive();
    if (has(ALL, world.state.focus)) plate.renderSource(world.state.focus);
    else if (has(world.craft, world.state.focus)) plate.renderCraftSource(world.state.focus);
    if (diag.isOn()) diag.render();
  }
  if (now - hashTick > 1000) {
    hashTick = now;
    sync.write();
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
