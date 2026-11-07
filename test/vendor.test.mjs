import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { FILES } from "../tools/vendor.mjs";

const pairs = FILES.filter(([from, , optional]) => !optional || existsSync(new URL(`../${from}`, import.meta.url)));
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url));

test("vendored libraries are byte-identical to the pinned npm packages", () => {
  for (const [from, to] of pairs) assert.ok(read(from).equals(read(to)), `${to} is stale, run npm run vendor`);
});

test("the import map points only at local vendor files", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const target of Object.values(map)) assert.match(target, /^\.\/vendor\//, target);
});

test("app modules resolve through the import map to the vendored files", async () => {
  const { register } = await import("node:module");
  register("./importmap-hooks.mjs", import.meta.url);
  for (const file of ["world.js", "sky.js", "textures.js", "almanac.js", "ephemeris.js"]) {
    await import(`../src/${file}`);
  }
  const THREE = await import("three");
  assert.equal(typeof THREE.WebGLRenderer, "function");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
  assert.equal(typeof OrbitControls, "function");
});
