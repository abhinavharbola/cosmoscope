import { ORDER, MOONS } from "../../src/data.js";
import { parseCatalog, createTrack } from "../../src/missions.js";

const EPOCH = Date.UTC(2020, 0, 1);
const TEN_YEARS = 3650 * 86400;
const rawCraft = (name, kind, extra = {}) => ({
  name,
  kind,
  epochMs: EPOCH,
  t: [0, TEN_YEARS],
  p: [1, 0, 0, 2, 0, 0],
  v: [1 / 3650, 0, 0, 1 / 3650, 0, 0],
  facts: "Stub facts.",
  ...extra,
});

export const craftControl = { active: true };
export const moonCount = MOONS.length;

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
  state = {
    focus: "Overview",
    trueScale: false,
    showOrbits: true,
    showLabels: true,
    showMissions: true,
    missionSource: null,
    missionGenerated: null,
    surfaces: {},
    textureQuality: "2k",
  };
  const craft = Object.create(null);
  let pulse = false;
  return {
    state,
    bodies,
    craft,
    loadMissions() {
      return Promise.resolve().then(() => {
        const catalog = parseCatalog({
          version: 1,
          generated: "2026-11-01T00:00:00Z",
          objects: {
            StubProbe: rawCraft("Stub Probe", "spacecraft", { launch: "2020-01-01", errorAU: 0.00002, target: "Stub (-1)" }),
            StubComet: rawCraft("C/2000 <b>X</b> & Y", "comet", { target: "<i>t</i>" }),
          },
        });
        state.missionSource = catalog.source;
        state.missionGenerated = catalog.generated;
        for (const entry of Object.values(catalog.objects)) {
          craft[entry.id] = {
            data: entry,
            track: createTrack(entry),
            pos: [1.5, 0, 0],
            get active() {
              return craftControl.active;
            },
          };
        }
        return Object.values(craft).map((c) => c.data);
      });
    },
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
