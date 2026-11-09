import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseCatalog,
  createTrack,
  pathPoints,
  pathHead,
  trailAlpha,
  hermiteAt,
  hermiteVelocityAt,
  groupByKind,
  MAX_SAMPLES,
} from "../src/missions.js";
import {
  validateConfig,
  planChunks,
  buildQuery,
  parseVectors,
  densify,
  thin,
  thinToCap,
  encodeObject,
  serializeCatalog,
  emptyCatalog,
  CHUNK_ROWS,
} from "../tools/missions-lib.mjs";
import { bakeObject } from "../tools/fetch-missions.mjs";
import { helioPosition, separationAU } from "../src/ephemeris.js";
import { AU_KM } from "../src/data.js";
import { buildFixtureCatalog, fakeHorizons, testConfig, horizonsText } from "./missions-fixture.mjs";

const DAY = 86400000;
const START = Date.UTC(2020, 0, 1);

function goodRaw(over = {}) {
  return {
    name: "Probe",
    kind: "spacecraft",
    epochMs: START,
    t: [0, 86400, 172800],
    p: [1, 0, 0, 1, 0.1, 0, 1, 0.2, 0, ],
    v: [0, 0.1, 0, 0, 0.1, 0, 0, 0.1, 0],
    ...over,
  };
}

test("parseCatalog accepts a valid entry and fills defaults", () => {
  const c = parseCatalog({ version: 1, objects: { Probe: goodRaw() } });
  assert.equal(Object.keys(c.objects).length, 1);
  assert.equal(c.objects.Probe.color, "#8fd0ff");
  assert.match(c.source.url, /^https:\/\/ssd\.jpl\.nasa\.gov/);
  assert.ok(c.source.citation.includes("Giorgini"));
});

test("parseCatalog drops malformed entries and hostile ids", () => {
  const entries = {
    NoKind: goodRaw({ kind: "planet" }),
    Backwards: goodRaw({ t: [0, 100, 50] }),
    NotZero: goodRaw({ t: [1, 100, 200] }),
    Short: goodRaw({ p: [1, 2, 3] }),
    Nan: goodRaw({ v: [0, 0, 0, 0, 0, 0, 0, 0, null] }),
    OneSample: goodRaw({ t: [0], p: [1, 0, 0], v: [0, 0, 0] }),
    BadEpoch: goodRaw({ epochMs: 1e30 }),
    "bad id": goodRaw(),
    _lead: goodRaw(),
    Good: goodRaw(),
  };
  const body = Object.entries(entries)
    .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`)
    .join(",");
  const text = `{"version":1,"objects":{"__proto__":${JSON.stringify(goodRaw())},${body}}}`;
  const raw = JSON.parse(text);
  assert.ok(Object.hasOwn(raw.objects, "__proto__"));
  const c = parseCatalog(raw);
  assert.deepEqual(Object.keys(c.objects), ["Good"]);
  assert.equal(Object.getPrototypeOf(c.objects), null);
  assert.equal(Object.hasOwn(c.objects, "__proto__"), false);
});

test("parseCatalog rejects wrong versions and non-https source urls", () => {
  assert.equal(Object.keys(parseCatalog({ version: 2, objects: { A: goodRaw() } }).objects).length, 0);
  assert.equal(Object.keys(parseCatalog({ version: 2, bodies: {} }).objects).length, 0);
  assert.equal(Object.keys(parseCatalog(null).objects).length, 0);
  const c = parseCatalog({ version: 1, source: { name: "x", url: "javascript:alert(1)" }, objects: {} });
  assert.match(c.source.url, /^https:\/\//);
});

test("parseCatalog enforces the sample cap", () => {
  const n = MAX_SAMPLES + 1;
  const raw = goodRaw({
    t: Array.from({ length: n }, (_, i) => i * 60),
    p: new Array(n * 3).fill(1),
    v: new Array(n * 3).fill(0),
  });
  assert.equal(Object.keys(parseCatalog({ version: 1, objects: { Big: raw } }).objects).length, 0);
});

test("hermite reproduces a cubic exactly, position and velocity", () => {
  const f = (t, k) => [1 + 0.5 * t - 0.2 * t * t + 0.03 * t ** 3, -2 + t + 0.1 * t ** 3, 0.4 * t * t][k];
  const d = (t, k) => [0.5 - 0.4 * t + 0.09 * t * t, 1 + 0.3 * t * t, 0.8 * t][k];
  const t0 = 2;
  const t1 = 5;
  const p = [0, 1, 2].map((k) => f(t0, k)).concat([0, 1, 2].map((k) => f(t1, k)));
  const v = [0, 1, 2].map((k) => d(t0, k)).concat([0, 1, 2].map((k) => d(t1, k)));
  for (const s of [0, 0.25, 0.5, 0.9, 1]) {
    const t = t0 + s * (t1 - t0);
    const pos = hermiteAt(p, v, 0, 1, t1 - t0, s);
    const vel = hermiteVelocityAt(p, v, 0, 1, t1 - t0, s);
    for (let k = 0; k < 3; k++) {
      assert.ok(Math.abs(pos[k] - f(t, k)) < 1e-12, `pos ${s} ${k}`);
      assert.ok(Math.abs(vel[k] - d(t, k)) < 1e-12, `vel ${s} ${k}`);
    }
  }
});

test("a track hits its samples in the scene frame, clamps, and reports its range", () => {
  const entry = parseCatalog({ version: 1, objects: { Probe: goodRaw() } }).objects.Probe;
  const tr = createTrack(entry);
  assert.deepEqual(tr.positionAt(START).map((x) => Number(x.toFixed(12))), [1, 0, 0]);
  const end = tr.positionAt(START + 2 * DAY);
  assert.ok(Math.abs(end[0] - 1) < 1e-12 && Math.abs(end[1]) < 1e-12 && Math.abs(end[2] + 0.2) < 1e-12);
  assert.deepEqual(tr.positionAt(START - 10 * DAY), tr.positionAt(START));
  assert.deepEqual(tr.positionAt(START + 99 * DAY), tr.positionAt(START + 2 * DAY));
  assert.equal(tr.inRange(START - 1), false);
  assert.equal(tr.inRange(START), true);
  assert.equal(tr.inRange(START + 2 * DAY), true);
  assert.equal(tr.inRange(START + 2 * DAY + 1), false);
  const speed = tr.speedKmS(START + DAY);
  assert.ok(Math.abs(speed - (0.1 * AU_KM) / 86400) < 1e-6, String(speed));
});

test("path points follow the track and the head search is monotonic", () => {
  const cat = buildFixtureCatalog();
  const entry = cat.objects.TestProbe;
  const path = pathPoints(entry, 1200);
  assert.ok(path.ms.length <= 1200 + entry.t.length);
  for (let i = 1; i < path.ms.length; i++) assert.ok(path.ms[i] >= path.ms[i - 1]);
  const tr = createTrack(entry);
  for (const i of [0, 10, 100, path.ms.length - 1]) {
    const p = tr.positionAt(path.ms[i]);
    assert.ok(Math.hypot(p[0] - path.pts[3 * i], p[1] - path.pts[3 * i + 1], p[2] - path.pts[3 * i + 2]) < 1e-4);
  }
  assert.equal(pathHead(path.ms, path.ms[0] - 5), 0);
  assert.equal(pathHead(path.ms, path.ms.at(-1) + 5), path.ms.length - 1);
  const mid = path.ms[Math.floor(path.ms.length / 2)] + 1;
  const h = pathHead(path.ms, mid);
  assert.ok(path.ms[h] <= mid && path.ms[h + 1] > mid);
});

test("trail alpha is brightest at the head and fades behind and ahead", () => {
  const span = 1000;
  assert.ok(trailAlpha(0, span) > trailAlpha(500, span));
  assert.ok(trailAlpha(500, span) > trailAlpha(1000, span));
  assert.ok(trailAlpha(-500, span) < trailAlpha(0, span));
  assert.equal(trailAlpha(-2000, span), 0);
  assert.ok(trailAlpha(5000, span) > 0);
});

test("groupByKind orders spacecraft, comets, then asteroids", () => {
  const mk = (id, kind) => ({ id, kind });
  const groups = groupByKind({ a: mk("a", "asteroid"), c: mk("c", "comet"), s: mk("s", "spacecraft") });
  assert.deepEqual(groups.map((g) => g.kind), ["spacecraft", "comet", "asteroid"]);
});

test("the shipped source config is valid, and each object stays within the density cap", () => {
  const cfg = JSON.parse(readFileSync(new URL("../tools/missions-sources.json", import.meta.url), "utf8"));
  assert.deepEqual(validateConfig(cfg), []);
  const ids = cfg.objects.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(cfg.source.url.startsWith("https://ssd.jpl.nasa.gov"));
  const names = cfg.objects.map((o) => o.name.toLowerCase());
  for (const required of ["voyager 1", "voyager 2", "new horizons", "parker solar probe"]) {
    assert.ok(names.includes(required), required);
  }
  for (const o of cfg.objects) {
    assert.ok(o.maxSamples <= MAX_SAMPLES, `${o.id} maxSamples`);
    assert.ok(planChunks(o).total <= 120000, `${o.id} dense rows`);
  }
  const kinds = new Set(cfg.objects.map((o) => o.kind));
  assert.deepEqual([...kinds].sort(), ["asteroid", "comet", "spacecraft"]);
});

test("validateConfig reports each kind of mistake", () => {
  assert.ok(validateConfig(null).length);
  const bad = {
    objects: [
      { id: "A", name: "A", kind: "planet", command: "", from: "2020-01-01", to: "2019-01-01", stepMinutes: 0, tolAU: 0, maxSamples: 3 },
      { id: "A", name: "A", kind: "comet", command: "x", from: "2020-01-01", to: "2021-01-01", stepMinutes: 60, tolAU: 1, maxSamples: 20 },
    ],
  };
  const errs = validateConfig(bad).join("\n");
  for (const needle of ["kind", "command", "from and to", "stepMinutes", "tolAU", "maxSamples", "duplicate"]) {
    assert.ok(errs.includes(needle), needle);
  }
});

test("chunks are contiguous and cover every requested row once", () => {
  const cfg = testConfig({ from: "2020-01-01", to: "2021-01-01", stepMinutes: 60 });
  const plan = planChunks(cfg);
  assert.ok(plan.chunks.length >= 3);
  assert.equal(plan.chunks.reduce((s, c) => s + c.rows, 0), plan.total);
  assert.ok(plan.chunks.every((c) => c.rows <= CHUNK_ROWS));
  for (let i = 1; i < plan.chunks.length; i++) {
    assert.equal(plan.chunks[i].startMs, plan.chunks[i - 1].stopMs + plan.stepMs);
  }
  assert.equal(plan.chunks.at(-1).stopMs, Date.parse("2021-01-01T00:00:00Z"));
});

test("the Horizons query asks for heliocentric ecliptic J2000 vectors in AU and AU/day", () => {
  const cfg = testConfig({ command: "DES=1P;CAP" });
  const url = buildQuery(cfg, planChunks(cfg).chunks[0]);
  const q = new URL(url).searchParams;
  assert.equal(new URL(url).origin + new URL(url).pathname, "https://ssd.jpl.nasa.gov/api/horizons.api");
  assert.equal(q.get("COMMAND"), "'DES=1P;CAP'");
  assert.equal(q.get("EPHEM_TYPE"), "'VECTORS'");
  assert.equal(q.get("CENTER"), "'500@10'");
  assert.equal(q.get("REF_PLANE"), "'ECLIPTIC'");
  assert.equal(q.get("OUT_UNITS"), "'AU-D'");
  assert.equal(q.get("VEC_TABLE"), "'2'");
  assert.equal(q.get("CSV_FORMAT"), "'YES'");
  assert.equal(q.get("START_TIME"), "'2020-01-01 00:00'");
  assert.equal(q.get("STEP_SIZE"), "'1440 min'");
});

test("parseVectors reads rows and the target name, and explains replies with no data", () => {
  const text = horizonsText("Mars", START, 3, DAY, "Voyager 1 (spacecraft)");
  const r = parseVectors(text);
  assert.equal(r.rows.length, 3);
  assert.equal(r.target, "Voyager 1 (spacecraft)");
  assert.ok(r.rows[0].every(Number.isFinite));
  assert.throws(() => parseVectors("Multiple major-bodies match string \"1\"\n ID# Name"), /no ephemeris block[\s\S]*Multiple major-bodies/);
  assert.throws(() => parseVectors("$$SOE\n1, a, x, 2, 3, 4, 5, 6,\n$$EOE"), /unreadable row/);
});

test("thinning keeps endpoints, respects the tolerance and shrinks smooth data a lot", () => {
  const cfg = testConfig();
  const plan = planChunks(cfg);
  const parsed = plan.chunks.map((c) => parseVectors(horizonsText("Mars", c.startMs, c.rows, c.stepMs)));
  const dense = densify(plan.chunks, parsed);
  const r = thin(dense, 1e-4);
  assert.equal(r.indices[0], 0);
  assert.equal(r.indices.at(-1), dense.n - 1);
  assert.ok(r.indices.length < dense.n / 4, `${r.indices.length} of ${dense.n}`);
  assert.ok(r.maxErrAU <= 1e-4);
  const tight = thin(dense, 1e-6);
  assert.ok(tight.indices.length > r.indices.length);
});

test("thinToCap loosens the tolerance until the sample cap is met", () => {
  const cfg = testConfig();
  const plan = planChunks(cfg);
  const parsed = plan.chunks.map((c) => parseVectors(horizonsText("Mars", c.startMs, c.rows, c.stepMs)));
  const dense = densify(plan.chunks, parsed);
  const free = thinToCap(dense, 1e-7, 4000);
  const capped = thinToCap(dense, 1e-7, 30);
  assert.ok(capped.indices.length <= 30);
  assert.ok(capped.tolAU > 1e-7);
  assert.ok(capped.maxErrAU > free.maxErrAU);
});

test("a baked catalog tracks the ephemeris within the recorded error across the window", async () => {
  const cfg = testConfig();
  const { fetchImpl, calls } = fakeHorizons("Mars");
  const baked = await bakeObject(cfg, fetchImpl, 0);
  assert.ok(calls.length >= 1);
  assert.equal(baked.target, "Mars (499)");
  assert.ok(baked.kept <= cfg.maxSamples && baked.kept < baked.dense);

  const catalog = emptyCatalog();
  catalog.objects.TestProbe = baked.entry;
  const text = serializeCatalog(catalog);
  assert.doesNotThrow(() => JSON.parse(text));
  const parsed = parseCatalog(JSON.parse(text));
  const track = createTrack(parsed.objects.TestProbe);

  const a = Date.parse("2020-01-01T00:00:00Z");
  const b = Date.parse("2023-01-01T00:00:00Z");
  let worst = 0;
  for (let i = 0; i <= 300; i++) {
    const ms = a + ((b - a) * i) / 300;
    const want = helioPosition("Mars", ms);
    const got = track.positionAt(ms);
    worst = Math.max(worst, separationAU(want, got));
  }
  assert.ok(worst < 3 * cfg.tolAU, `worst ${worst}`);
  assert.ok(Math.abs(track.speedKmS(Date.parse("2021-06-01T00:00:00Z")) - 24) < 6);
});

test("a multi chunk bake stitches rows without gaps or duplicates", async () => {
  const cfg = testConfig({ from: "2020-01-01", to: "2020-07-01", stepMinutes: 60, tolAU: 0.0002 });
  const { fetchImpl, calls } = fakeHorizons("Mars");
  const baked = await bakeObject(cfg, fetchImpl, 0);
  assert.ok(calls.length >= 2);
  const track = createTrack(parseCatalog(JSON.parse(serializeCatalog({ ...emptyCatalog(), objects: { TestProbe: baked.entry } }))).objects.TestProbe);
  for (const iso of ["2020-02-29T12:00:00Z", "2020-05-15T03:00:00Z"]) {
    const ms = Date.parse(iso);
    assert.ok(separationAU(helioPosition("Mars", ms), track.positionAt(ms)) < 6e-4, iso);
  }
});

test("a short Horizons reply is reported with the object and the likely cause", async () => {
  const cfg = testConfig();
  const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ result: horizonsText("Mars", START, 5, DAY) }) });
  await assert.rejects(bakeObject(cfg, fetchImpl, 0), /TestProbe: asked for \d+ rows and got 5[\s\S]*coverage/);
});

test("a Horizons error is not retried and carries the message", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return { ok: true, status: 200, json: async () => ({ error: "Cannot interpret date" }) };
  };
  await assert.rejects(bakeObject(testConfig(), fetchImpl, 0), /Cannot interpret date/);
  assert.equal(n, 1);
});

test("the committed catalog parses without dropping entries and stays under the size cap", () => {
  const raw = readFileSync(new URL("../data/missions.json", import.meta.url), "utf8");
  assert.ok(Buffer.byteLength(raw) < 700 * 1024);
  const json = JSON.parse(raw);
  const parsed = parseCatalog(json);
  assert.equal(Object.keys(parsed.objects).length, Object.keys(json.objects).length);
  const cfg = JSON.parse(readFileSync(new URL("../tools/missions-sources.json", import.meta.url), "utf8"));
  const known = new Set(cfg.objects.map((o) => o.id));
  for (const id of Object.keys(json.objects)) assert.ok(known.has(id), `${id} is not in missions-sources.json`);
});

test("an HTTP 4xx reply is not retried and carries the response text", async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return { ok: false, status: 400, text: async () => "bad COMMAND value", json: async () => ({}) };
  };
  await assert.rejects(bakeObject(testConfig(), fetchImpl, 0), /HTTP 400: bad COMMAND value/);
  assert.equal(n, 1);
});

test("the recorded error is never smaller than the measured one", () => {
  const cfg = testConfig();
  const plan = planChunks(cfg);
  const parsed = plan.chunks.map((c) => parseVectors(horizonsText("Mars", c.startMs, c.rows, c.stepMs)));
  const dense = densify(plan.chunks, parsed);
  const t = thinToCap(dense, cfg.tolAU, cfg.maxSamples);
  assert.ok(encodeObject(cfg, dense, t, null).errorAU >= t.maxErrAU);
});
