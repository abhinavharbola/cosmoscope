import { PLANETS } from "./data.js";
import { formatDuration } from "./format.js";

const RANGES = [2, 5, 10, 20, 40, 80, 125];

export function createRuler(els) {
  const ticks = PLANETS.map((p) => {
    const el = document.createElement("span");
    el.className = "tick";
    el.innerHTML = `<i></i><b>${p.name}</b>`;
    els.track.appendChild(el);
    return { id: p.id, el, label: el.querySelector("b") };
  });

  function pickRange(radius) {
    const need = Math.max(radius * 1.08, 1.8);
    return RANGES.find((r) => r >= need) || RANGES[RANGES.length - 1];
  }

  return {
    show() {
      els.root.hidden = false;
      els.last.innerHTML = "";
    },
    hide() {
      els.root.hidden = true;
    },
    log(html) {
      els.last.innerHTML = html;
    },
    update(radiusAU, elapsedSec, distances) {
      const range = pickRange(radiusAU);
      els.fill.style.width = `${Math.min(100, (radiusAU / range) * 100).toFixed(3)}%`;
      els.time.textContent = formatDuration(elapsedSec);
      els.scale.textContent = `${range} AU`;
      const width = els.track.clientWidth || 600;
      let lastLabel = -1000;
      const visible = ticks
        .map((t) => ({ t, x: ((distances[t.id] || 0) / range) * width }))
        .sort((a, b) => a.x - b.x);
      ticks.forEach((t) => {
        t.el.style.display = "none";
      });
      visible.forEach(({ t, x }) => {
        if (x > width) return;
        t.el.style.display = "block";
        t.el.style.left = `${x.toFixed(1)}px`;
        t.el.classList.toggle("reached", x <= (radiusAU / range) * width);
        const showLabel = x - lastLabel > 62;
        t.label.style.visibility = showLabel ? "visible" : "hidden";
        if (showLabel) lastLabel = x;
      });
    },
  };
}
