import { loadApod, loadNeo, loadFlares, getApiKey, setApiKey } from "./nasa.js";

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function flareClassNote(cls) {
  const c = (cls || "").charAt(0);
  if (c === "X") return "strong";
  if (c === "M") return "moderate";
  return "minor";
}

export function createDispatch(els) {
  async function load() {
    els.body.innerHTML = `<p class="dim">Contacting NASA</p>`;
    const [apod, neo, flr] = await Promise.allSettled([loadApod(), loadNeo(), loadFlares()]);
    const parts = [];

    if (apod.status === "fulfilled") {
      const a = apod.value.data;
      const media =
        a.mediaType === "image"
          ? `<a href="${esc(a.hdurl || a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.title)}"></a>`
          : `<a class="link" href="${esc(a.url)}" target="_blank" rel="noopener">Open today's media</a>`;
      parts.push(
        `<section><h4>Picture of the day</h4>${media}<p class="cap-line">${esc(a.title)}</p><p class="dim">${
          a.copyright ? `Credit: ${esc(a.copyright.trim())}` : "NASA APOD"
        }</p></section>`
      );
    }
    if (neo.status === "fulfilled") {
      const n = neo.value.data;
      const c = n.closest;
      parts.push(
        `<section><h4>Near-Earth objects today</h4><p class="big">${n.count}</p>` +
          (c
            ? `<p class="dim">Closest: ${esc(c.name)} at ${c.lunarDistance.toFixed(1)} lunar distances, ${c.speedKmS.toFixed(1)} km/s, up to ${Math.round(
                c.diameterM
              )} m across.${n.hazardous ? ` ${n.hazardous} flagged potentially hazardous.` : ""}</p>`
            : "") +
          `</section>`
      );
    }
    if (flr.status === "fulfilled") {
      const f = flr.value.data;
      parts.push(
        `<section><h4>Solar flares, 14 days</h4><p class="big">${f.count}</p>` +
          (f.latest
            ? `<p class="dim">Latest: class ${esc(f.latest.cls)} (${flareClassNote(f.latest.cls)}), peak ${esc(
                f.latest.peak.replace("T", " ").replace("Z", " UTC")
              )}.</p>`
            : `<p class="dim">No flares recorded in the window.</p>`) +
          `</section>`
      );
    }
    const failed = [apod, neo, flr].filter((r) => r.status === "rejected").length;
    if (failed) {
      parts.push(
        `<p class="dim">${failed} of 3 feeds did not load. The shared DEMO_KEY is rate limited. A free key from api.nasa.gov fixes that.</p>`
      );
    }
    els.body.innerHTML = parts.join("");
    els.badge.textContent = neo.status === "fulfilled" ? String(neo.value.data.count) : "";
  }

  els.key.value = getApiKey() === "DEMO_KEY" ? "" : getApiKey();
  els.save.addEventListener("click", () => {
    setApiKey(els.key.value);
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("nasa_cache_"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      return load();
    }
    return load();
  });
  els.toggle.addEventListener("click", () => {
    const open = els.panel.hidden;
    els.panel.hidden = !open;
    els.toggle.setAttribute("aria-expanded", String(open));
  });

  return { load };
}
