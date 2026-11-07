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
