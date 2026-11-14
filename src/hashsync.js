import { VIEWS } from "./views.js";
import { parseHash, buildHash, SCALE_DEFAULT } from "./hash.js";
import { has } from "./dom.js";
import { sim, setScale } from "./sim.js";

export function createHashSync({ world, focusOn, viewCtl }) {
  let lastHash = "";
  let pending = null;

  function read(fromChange = false) {
    const h = parseHash(location.hash, (f) => has(VIEWS, f) || has(world.bodies, f) || has(world.craft, f));
    if (h.ms !== null) sim.ms = h.ms;
    else if (fromChange) sim.ms = Date.now();
    sim.scale = h.scale !== null ? h.scale : SCALE_DEFAULT;
    sim.paused = h.paused;
    sim.direction = h.reverse ? -1 : 1;
    if (world.state.trueScale !== h.trueScale) {
      viewCtl.forgetRestore();
      world.setTrueScale(h.trueScale);
    }
    world.state.showOrbits = h.orbits;
    world.state.showLabels = h.labels;
    world.state.showMissions = h.missions;
    return h;
  }

  function write() {
    const h = buildHash(world.state.focus, sim.scale, sim.ms, Date.now(), {
      paused: sim.paused,
      reverse: sim.direction < 0,
      trueScale: world.state.trueScale,
      orbits: world.state.showOrbits,
      labels: world.state.showLabels,
      missions: world.state.showMissions,
      view: world.state.trans ? null : world.getView(),
    });
    if (pending) return;
    if (h !== lastHash) {
      lastHash = h;
      try {
        history.replaceState(null, "", `#${h}`);
      } catch {
        lastHash = "";
      }
    }
  }

  function applyView(h) {
    if (h.view && !pending) world.setView(h.view);
  }

  function start() {
    const h = read();
    if (!h.focus) {
      const wanted = new URLSearchParams(location.hash.replace(/^#/, "")).get("f");
      if (wanted && /^[A-Za-z][A-Za-z0-9]{0,31}$/.test(wanted) && !has(VIEWS, wanted) && !has(world.bodies, wanted)) {
        pending = wanted;
      }
    }
    return h;
  }

  window.addEventListener("hashchange", () => {
    if (location.hash.replace(/^#/, "") === lastHash) return;
    const h = read(true);
    setScale(sim.scale);
    focusOn(h.focus || "Overview");
    applyView(h);
  });

  return { start, write, applyView, pending: () => pending, clearPending: () => (pending = null) };
}
