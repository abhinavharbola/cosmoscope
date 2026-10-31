import { register } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { installCanvas } from "./canvas-stub.mjs";
import { encodePng } from "./png.mjs";

register("../test/hooks.mjs", import.meta.url);
installCanvas();

const { buildMaps, sunMap, ringTexture } = await import("../src/textures.js");
const { PLANETS, MOON } = await import("../src/data.js");
const { milkyWayTexture } = await import("../src/sky.js");

const only = new Set(process.argv.slice(2));
const outDir = new URL("../out/textures/", import.meta.url);
await mkdir(outDir, { recursive: true });

async function save(name, tex) {
  const c = tex.image;
  await writeFile(new URL(`${name}.png`, outDir), encodePng(c.width, c.height, c.data));
}

async function timed(name, fn) {
  if (only.size && !only.has(name)) return;
  const t0 = performance.now();
  const out = await fn();
  const ms = performance.now() - t0;
  console.log(`${name.padEnd(10)} ${(ms / 1000).toFixed(2)} s`);
  return out;
}

let total = 0;
const t0 = performance.now();

for (const body of [...PLANETS, MOON]) {
  const maps = await timed(body.id, () => buildMaps(body));
  if (!maps) continue;
  for (const [slot, tex] of Object.entries(maps)) await save(`${body.id}_${slot}`, tex);
}

const sun = await timed("Sun", () => sunMap());
if (sun) await save("Sun_map", sun);

const sky = await timed("MilkyWay", () => milkyWayTexture());
if (sky) await save("MilkyWay", sky);

const saturn = PLANETS.find((p) => p.id === "Saturn");
const ring = ringTexture(saturn.rings);
const rc = ring.image;
const tall = new Uint8ClampedArray(rc.width * 48 * 4);
for (let y = 0; y < 48; y++) tall.set(rc.data.subarray(0, rc.width * 4), y * rc.width * 4);
await writeFile(new URL("SaturnRing.png", outDir), encodePng(rc.width, 48, tall));

total = performance.now() - t0;
console.log(`total      ${(total / 1000).toFixed(2)} s`);
