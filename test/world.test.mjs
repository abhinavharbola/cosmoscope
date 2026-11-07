import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { JSDOM } from "jsdom";
import { installCanvas } from "../tools/canvas-stub.mjs";

register("./importmap-hooks.mjs", import.meta.url);
register("./stubs/three-headless-hooks.mjs", import.meta.url);

installCanvas();
const makeCanvas = globalThis.document.createElement;

const dom = new JSDOM('<!doctype html><canvas id="stage"></canvas><div id="labels"></div>', { url: "http://localhost/" });
const w = dom.window;
const realCreate = w.document.createElement.bind(w.document);
w.document.createElement = (tag, ...rest) => (tag === "canvas" ? makeCanvas() : realCreate(tag, ...rest));
Object.assign(globalThis, { window: w, document: w.document });
Object.defineProperty(w, "innerWidth", { value: 1000 });
Object.defineProperty(w, "innerHeight", { value: 640 });
globalThis.fetch = async () => new Response(JSON.stringify({ version: 2, bodies: {} }), { status: 200 });

const { createWorld } = await import("../src/world.js");
const { MOONS, PLANETS, SUN, MOMENTS } = await import("../src/data.js");

const hooks = { onSelect() {}, onProgress() {} };
const world = createWorld(w.document.getElementById("stage"), w.document.getElementById("labels"), hooks);
const allIds = [SUN.id, ...PLANETS.map((p) => p.id), ...MOONS.map((m) => m.id)];

let clock = 1000;
const frame = (simMs, scale = 3600, dtMs = 16) => {
  clock += dtMs;
  return world.update(simMs, scale, clock);
};

const finite = (v) => Number.isFinite(v);

test("every body exists and loads a texture set headlessly", async () => {
  assert.deepEqual(Object.keys(world.bodies).sort(), [...allIds].sort());
  await world.loadTextures();
  for (const id of allIds) assert.ok(world.bodies[id].maps, `${id} has maps`);
  assert.ok(world.state.textureMs > 0);
});

test("update keeps every position, rotation and light finite across focus changes and scales", () => {
  const start = Date.parse("2026-11-07T00:00:00Z");
  let ms = start;
  for (const focus of ["Overview", "Earth", "Moon", "Saturn", "Phobos", "Triton", "Pluto", "Sun"]) {
    world.setFocus(focus, {});
    for (let i = 0; i < 4; i++) {
      frame(ms);
      ms += 3600000;
    }
    for (const id of allIds) {
      const b = world.bodies[id];
      assert.ok(b.pos.every(finite), `${id} pos`);
      assert.ok(finite(b.mesh.rotation.y), `${id} rotation`);
      assert.ok(b.group.position.toArray().every(finite), `${id} scene position`);
    }
  }
  world.render();
  assert.ok(world.diagnostics().calls >= 1);
});

test("true scale and orbit toggles run without errors", () => {
  const ms = Date.parse("2026-11-07T00:00:00Z");
  world.setTrueScale(true);
  frame(ms);
  world.setFocus("Earth", {});
  frame(ms);
  world.setTrueScale(false);
  frame(ms);
  world.state.showOrbits = false;
  frame(ms);
  world.state.showOrbits = true;
  frame(ms);
});

test("fast rotation does not snap the surface and blends back to the true angle", () => {
  world.setFocus("Overview", {});
  const ms = Date.parse("2026-11-07T00:00:00Z");
  for (let i = 0; i < 3; i++) frame(ms, 1);
  const slow = world.bodies.Mars.mesh.rotation.y;
  frame(ms, 1e6);
  const fast = world.bodies.Mars.mesh.rotation.y;
  const wrap = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  assert.ok(wrap(fast - slow) < 0.05, `entry jump ${wrap(fast - slow)}`);
  let last = fast;
  for (let i = 0; i < 400; i++) last = (frame(ms, 1), world.bodies.Mars.mesh.rotation.y);
  assert.ok(wrap(last - slow) < 0.2, `exit offset ${wrap(last - slow)}`);
});

test("trail colors are only rewritten when the head sample changes", () => {
  world.setFocus("Overview", {});
  const ms = Date.parse("2026-11-07T00:00:00Z");
  frame(ms, 1);
  const earth = world.bodies.Earth;
  const before = earth.orbit.geometry.attributes.color.version;
  frame(ms, 1);
  frame(ms, 1);
  assert.equal(earth.orbit.geometry.attributes.color.version, before);
});

test("the light pulse logs each planet once with increasing arrival times", () => {
  const ms = Date.parse("2026-11-07T00:00:00Z");
  frame(ms);
  world.emitPulse(ms);
  const seen = [];
  let t = ms;
  for (let i = 0; i < 400; i++) {
    t += 60000;
    const out = frame(t, 300);
    seen.push(...out.arrivals);
    if (out.pulseRadius === null) break;
  }
  const ids = seen.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("Mercury") && ids.includes("Neptune"));
  const mercury = seen.find((a) => a.id === "Mercury").seconds;
  const earth = seen.find((a) => a.id === "Earth").seconds;
  assert.ok(mercury > 100 && mercury < earth && earth < 560, `${mercury} ${earth}`);
  world.stopPulse();
});

test("eclipse moments fly in and shade only at true scale", () => {
  const moment = MOMENTS.find((m) => m.eclipse);
  const ms = Date.parse(moment.iso);
  world.setTrueScale(true);
  world.setFocus("Earth", { eclipse: true });
  for (let i = 0; i < 5; i++) frame(ms, 30);
  assert.ok(world.state.eclipseView);
  world.setFocus("Overview", {});
  assert.equal(world.state.eclipseView, false);
});

const { buildFixtureCatalog, buildFixtureText } = await import("./missions-fixture.mjs");
const { helioPosition, separationAU } = await import("../src/ephemeris.js");

const MISSION_MS = Date.parse("2021-03-01T00:00:00Z");
const settle = (ms, scale = 3600) => frame(ms, scale, 3000);

test("a loaded mission tracks the ephemeris and is inactive outside its data window", () => {
  const list = world.setMissions(buildFixtureCatalog());
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(world.craft), ["TestProbe"]);
  world.setFocus("Overview", {});
  frame(MISSION_MS);
  const cr = world.craft.TestProbe;
  assert.equal(cr.active, true);
  assert.ok(separationAU(cr.pos, helioPosition("Mars", MISSION_MS)) < 3e-4);
  assert.equal(cr.marker.visible, true);
  frame(Date.parse("2019-01-01T00:00:00Z"));
  assert.equal(cr.active, false);
  assert.equal(cr.marker.visible, false);
  assert.equal(cr.label.style.display, "none");
  assert.ok(cr.pos.every(finite));
});

test("focusing a mission centres the camera on it and survives scale and toggle changes", () => {
  world.setFocus("TestProbe", {});
  settle(MISSION_MS);
  settle(MISSION_MS);
  const cr = world.craft.TestProbe;
  assert.equal(world.state.focus, "TestProbe");
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(world.state.center[i] - cr.pos[i]) < 1e-9);
  assert.ok(Math.abs(cr.sx - 500) < 2 && Math.abs(cr.sy - 320) < 2, `${cr.sx} ${cr.sy}`);
  assert.equal(cr.shown, true);
  world.setTrueScale(true);
  frame(MISSION_MS);
  world.setTrueScale(false);
  world.state.showOrbits = false;
  frame(MISSION_MS);
  assert.equal(cr.line.visible, false);
  world.state.showOrbits = true;
  world.state.showMissions = false;
  frame(MISSION_MS);
  assert.equal(cr.marker.visible, false);
  assert.equal(cr.line.visible, false);
  assert.equal(cr.label.style.display, "none");
  world.state.showMissions = true;
  frame(MISSION_MS);
  assert.equal(cr.marker.visible, true);
  assert.ok(world.camera.position.toArray().every(finite));
});

test("mission trail colors are only rewritten when the head sample changes", () => {
  const cr = world.craft.TestProbe;
  frame(MISSION_MS, 1);
  const before = cr.line.geometry.attributes.color.version;
  frame(MISSION_MS, 1);
  frame(MISSION_MS, 1);
  assert.equal(cr.line.geometry.attributes.color.version, before);
  frame(MISSION_MS + 200 * 86400000, 1);
  assert.ok(cr.line.geometry.attributes.color.version > before);
});

test("a mission id that collides with a body is ignored", () => {
  const cat = buildFixtureCatalog();
  cat.objects.Earth = { ...cat.objects.TestProbe, id: "Earth" };
  cat.objects.Phobos = { ...cat.objects.TestProbe, id: "Phobos" };
  const list = world.setMissions(cat);
  assert.deepEqual(list.map((o) => o.id), ["TestProbe"]);
  assert.equal(world.bodies.Earth.data.id, "Earth");
});

test("loadMissions reads a catalog, and a missing or foreign file yields an empty list", async () => {
  const realFetch = globalThis.fetch;
  try {
    const text = buildFixtureText();
    globalThis.fetch = async () => new Response(text, { status: 200 });
    const list = await world.loadMissions("data/missions.json");
    assert.deepEqual(list.map((o) => o.id), ["TestProbe"]);
    assert.ok(world.state.missionGenerated > 0);

    globalThis.fetch = async () => new Response(JSON.stringify({ version: 2, bodies: {} }), { status: 200 });
    assert.deepEqual(await world.loadMissions(), []);
    assert.deepEqual(Object.keys(world.craft), []);

    const warn = console.warn;
    console.warn = () => {};
    try {
      globalThis.fetch = async () => new Response("nope", { status: 404 });
      assert.deepEqual(await world.loadMissions(), []);
      globalThis.fetch = async () => {
        throw new Error("offline");
      };
      assert.deepEqual(await world.loadMissions(), []);
    } finally {
      console.warn = warn;
    }
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("clearing missions while one is focused falls back to the overview", () => {
  world.setMissions(buildFixtureCatalog());
  world.setFocus("TestProbe", {});
  frame(MISSION_MS);
  world.setMissions({ source: null, generated: null, objects: {} });
  assert.equal(world.state.focus, "Overview");
  assert.equal(w.document.querySelectorAll("#labels .label.craft").length, 0);
  frame(MISSION_MS);
});
