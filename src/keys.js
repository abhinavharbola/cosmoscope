import { ORDER } from "./data.js";
import { $, has } from "./dom.js";
import { stepScale, togglePause, toggleReverse, jumpNow } from "./sim.js";

export function installKeys({ focusOn, menus, help, about, tours, pulseCtl, viewCtl, diag }) {
  const keyMap = { m: "Moon", i: "Inner", o: "Overview" };
  ORDER.forEach((id, i) => {
    keyMap[String(i)] = id;
  });

  document.addEventListener("click", (e) => {
    const b = e.target && e.target.closest && e.target.closest("#index button, #presets button, #labels button");
    if (b && e.detail > 0) b.blur();
  });

  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") {
      if (e.key === "Escape") e.target.blur();
      return;
    }
    const k = e.key;
    if (k === "Escape") {
      if (help.isOpen()) help.toggle(false);
      else if (about.isOpen()) about.toggle(false);
      else if (menus.isOpen()) menus.close();
      else if (!$("dispatch").hidden) {
        $("dispatch").hidden = true;
        $("dispatch-toggle").setAttribute("aria-expanded", "false");
      } else if (tours.isActive()) tours.stop();
      else focusOn("Overview");
      return;
    }
    if (e.repeat) return;
    if (help.isOpen()) {
      if (k === "?") help.toggle(false);
      return;
    }
    if (about.isOpen()) return;
    if (k === " ") {
      if (tag === "BUTTON") return;
      e.preventDefault();
      togglePause();
      return;
    }
    if (k === "?") return help.toggle();
    if (tours.isActive()) {
      if (k === "ArrowRight") return tours.next();
      if (k === "ArrowLeft") return tours.prev();
    }
    if (k === "[") return stepScale(-1);
    if (k === "]") return stepScale(1);
    const lower = k.toLowerCase();
    if (lower === "r") return toggleReverse();
    if (lower === "n") return jumpNow();
    if (lower === "l") return pulseCtl.toggle();
    if (lower === "t") return viewCtl.toggleSizes();
    if (lower === "v") return viewCtl.toggleOrbits();
    if (lower === "k") return viewCtl.toggleLabels();
    if (lower === "d") return diag.toggle();
    if (has(keyMap, lower)) focusOn(keyMap[lower]);
  });

  window.addEventListener("keyup", (e) => {
    const tag = e.target && e.target.tagName;
    if (e.key === " " && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "BUTTON") e.preventDefault();
  });
}
