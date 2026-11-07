import * as Astronomy from "astronomy-engine";
import { planChunks, parseVectors, densify, thinToCap, encodeObject, serializeCatalog, emptyCatalog } from "../tools/missions-lib.mjs";
import { parseCatalog } from "../src/missions.js";

const E = (23.4392911 * Math.PI) / 180;
const COS = Math.cos(E);
const SIN = Math.sin(E);
const HOUR = 3600000;

export function eclipticState(body, ms) {
  const v = Astronomy.HelioVector(Astronomy.Body[body], new Date(ms));
  return [v.x, v.y * COS + v.z * SIN, -v.y * SIN + v.z * COS];
}

export function eclipticVelocity(body, ms) {
  const a = eclipticState(body, ms - HOUR);
  const b = eclipticState(body, ms + HOUR);
  return a.map((_, i) => (b[i] - a[i]) / (2 / 24));
}

export function horizonsText(body, startMs, rows, stepMs, target = "Mars (499)") {
  const lines = [`Target body name: ${target}                       {source: mar099}`, "$$SOE"];
  for (let k = 0; k < rows; k++) {
    const ms = startMs + k * stepMs;
    const nums = [...eclipticState(body, ms), ...eclipticVelocity(body, ms)].map((x) => x.toExponential(15));
    lines.push(`${(ms / 86400000 + 2440587.5).toFixed(9)}, A.D. ${new Date(ms).toISOString()}, ${nums.join(", ")},`);
  }
  lines.push("$$EOE");
  return lines.join("\n");
}

export function fakeHorizons(body) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const q = new URL(url).searchParams;
    const val = (k) => q.get(k).replace(/^'|'$/g, "");
    const stamp = (s) => Date.parse(`${s.replace(" ", "T")}:00Z`);
    const start = stamp(val("START_TIME"));
    const stop = stamp(val("STOP_TIME"));
    const step = parseInt(val("STEP_SIZE"), 10) * 60000;
    const rows = Math.floor((stop - start) / step) + 1;
    const result = horizonsText(body, start, rows, step);
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
  return { fetchImpl, calls };
}

export function testConfig(overrides = {}) {
  return {
    id: "TestProbe",
    name: "Test Probe",
    kind: "spacecraft",
    command: "-999",
    from: "2020-01-01",
    to: "2023-01-01",
    stepMinutes: 1440,
    tolAU: 0.0001,
    maxSamples: 400,
    launch: "2020-01-01",
    facts: "Fixture object.",
    ...overrides,
  };
}

export function buildFixtureText(body = "Mars", cfg = testConfig()) {
  const plan = planChunks(cfg);
  const parsed = plan.chunks.map((c) => parseVectors(horizonsText(body, c.startMs, c.rows, c.stepMs)));
  const dense = densify(plan.chunks, parsed);
  const thinned = thinToCap(dense, cfg.tolAU, cfg.maxSamples);
  const catalog = emptyCatalog();
  catalog.generated = "2026-11-07T00:00:00Z";
  catalog.objects[cfg.id] = encodeObject(cfg, dense, thinned, "Mars (499)");
  return serializeCatalog(catalog);
}

export function buildFixtureCatalog(body = "Mars", cfg = testConfig()) {
  return parseCatalog(JSON.parse(buildFixtureText(body, cfg)));
}
