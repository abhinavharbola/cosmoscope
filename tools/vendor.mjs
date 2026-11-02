import { cp, mkdir } from "node:fs/promises";

const files = [
  ["node_modules/three/build/three.module.js", "vendor/three.module.js"],
  ["node_modules/three/examples/jsm/controls/OrbitControls.js", "vendor/three-addons/controls/OrbitControls.js"],
  ["node_modules/three/LICENSE", "vendor/three.LICENSE"],
  ["node_modules/astronomy-engine/esm/astronomy.js", "vendor/astronomy.js"],
];

for (const [from, to] of files) {
  await mkdir(new URL(`../${to}/..`, import.meta.url), { recursive: true });
  await cp(new URL(`../${from}`, import.meta.url), new URL(`../${to}`, import.meta.url));
  console.log(`${from} -> ${to}`);
}
