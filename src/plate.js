import { AU_KM, C_AU_S, BODIES as ALL, SOURCE_FACTS, SOURCE_POSITIONS } from "./data.js";
import { distanceAU, separationAU, moonOffset } from "./ephemeris.js";
import { esc } from "./escape.js";
import { formatDuration, fmtNum, fmtCeil, formatAU, formatGravity, formatMass, shortDate } from "./format.js";
import { KIND_LABEL, DEFAULT_SOURCE } from "./missions.js";
import { nextSolarEclipse, nextLunarEclipse } from "./eclipses.js";
import { $, has, setText, setHTML } from "./dom.js";
import { sim } from "./sim.js";

export function createPlate(world) {
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
    if (d.errorAU !== null) rows.push(row("Interpolation error", `under ${fmtCeil(d.errorAU * AU_KM, 2)} km`, { extra: true }));
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
    if (d.parent) rows.push(row("Position model", d.source === "keplerian" ? "Illustrative circular orbit" : "Ephemeris", { extra: true }));
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

  return { renderPlate, renderSource, renderCraftSource, updateLive };
}
