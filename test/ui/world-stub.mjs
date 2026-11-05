export const VIEWS = { Overview: { dist: 85 }, Inner: { dist: 4.5 } };
export const calls = { emit: 0, stop: 0, focus: [] };

const ids = [
  "Sun", "Mercury", "Venus", "Earth", "Moon",
  "Mars", "Phobos", "Deimos",
  "Jupiter", "Io", "Europa", "Ganymede", "Callisto",
  "Saturn", "Titan",
  "Uranus",
  "Neptune", "Triton",
  "Pluto",
];

export function createWorld() {
  const bodies = {};
  ids.forEach((id, i) => {
    bodies[id] = { pos: [i * 0.5, 0, 0], data: { parent: null } };
  });
  bodies.Earth.pos = [1, 0, 0];
  bodies.Moon.pos = [1.002, 0, 0];
  bodies.Moon.data.parent = "Earth";
  bodies.Io.pos = [5.002, 0, 0];
  bodies.Io.data.parent = "Jupiter";
  const state = { focus: "Overview", trueScale: false, showOrbits: true, showLabels: true, surfaces: {}, textureQuality: "2k" };
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
    },
    loadTextures: () => Promise.resolve(),
    setTextureQuality() {},
    textureTiers: () => [],
    diagnostics: () => ({ gpu: "x", calls: 0, triangles: 0, degraded: false, textureMs: 1 }),
  };
}