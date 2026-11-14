import { PLANETS, MOONS, INDEX_IDS, BODIES as ALL } from "./data.js";
import { distanceAU } from "./ephemeris.js";
import { formatAU } from "./format.js";
import { groupByKind } from "./missions.js";
import { $, has, setText } from "./dom.js";

export function createNav(world, focusOn) {
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

  function setActive(id) {
    Object.entries(navButtons).forEach(([k, b]) => b.classList.toggle("active", k === id));
  }

  return { setActive, buildMissionIndex, renderIndex };
}
