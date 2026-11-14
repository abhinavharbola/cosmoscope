import { $, setText, setHTML } from "./dom.js";
import { sim, PRESETS, sliderToScale, setScale, nearestPreset, togglePause, toggleReverse, jumpNow, isLive } from "./sim.js";
import { createClock, formatRate, formatOffset, formatDuration } from "./format.js";
import { inputDate, parseInputDate } from "./dates.js";
import { almanac } from "./almanac.js";
import { writeStore } from "./storage.js";

const ICON = {
  play: '<svg viewBox="0 0 14 14"><path d="M3 1.5v11l9-5.5z"/></svg>',
  pause: '<svg viewBox="0 0 14 14"><path d="M3 1.5h3v11H3zM8 1.5h3v11H8z"/></svg>',
  reverse: '<svg viewBox="0 0 14 14"><path d="M11 1.5v11L2 7z"/></svg>',
};

export function createDock({ world, focusOn, viewCtl }) {
  const clock = createClock();

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

  const toggles = {
    sizes: $("btn-sizes"),
    orbits: $("btn-orbits"),
    labels: $("btn-labels"),
    quality: $("btn-quality"),
    missions: $("btn-missions"),
  };

  toggles.sizes.addEventListener("click", viewCtl.toggleSizes);
  toggles.orbits.addEventListener("click", viewCtl.toggleOrbits);
  toggles.labels.addEventListener("click", viewCtl.toggleLabels);
  toggles.missions.addEventListener("click", viewCtl.toggleMissions);
  toggles.quality.addEventListener("click", viewCtl.cycleQuality);

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

  return { renderClock, renderAlmanac, renderDock };
}
