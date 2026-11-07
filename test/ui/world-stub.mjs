import { ORDER, MOONS } from "../../src/data.js";

export let state = null;

export const calls = { emit: 0, stop: 0, focus: [], trueScale: [] };

export function createWorld() {
  const bodies = {};
  [...ORDER, ...MOONS.map((m) => m.id)].forEach((id, i) => {
    bodies[id] = { pos: [i * 0.5, 0, 0], data: { parent: null } };
  });
  bodies.Earth.pos = [1, 0, 0];
  for (const m of MOONS) {
    bodies[m.id].data.parent = m.parent;
    const parentPos = bodies[m.parent].pos;
    bodies[m.id].pos = [parentPos[0] + 0.002, 0, 0];
  }
  state = { focus: "Overview", trueScale: false, showOrbits: true, showLabels: true, surfaces: {}, textureQuality: "2k" };
  let pulse = false;
  return {
    state,
    bodies,
    setFocus(id) {
      state.focus = id;
      calls.focus.push(id);
    },
    update() {
      return { arrivals: [], pulseRadius: pulse ? 0.01 : null, pulseEnd: null };
    },
    render() {},
    emitPulse() {
      pulse = true;
      calls.emit++;
    },
    stopPulse() {
      pulse = false;
      calls.stop++;
    },
    setTrueScale(v) {
      state.trueScale = v;
      calls.trueScale.push(v);
    },
    loadTextures: () => Promise.resolve(),
    setTextureQuality() {},
    textureTiers: () => [],
    diagnostics: () => ({ gpu: "x", calls: 0, triangles: 0, degraded: false, textureMs: 1 }),
  };
}
