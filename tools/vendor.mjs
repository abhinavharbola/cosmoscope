import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const FILES = [
  ["node_modules/three/build/three.module.js", "vendor/three.module.js"],
  ["node_modules/three/build/three.core.js", "vendor/three.core.js", true],
  ["node_modules/three/examples/jsm/controls/OrbitControls.js", "vendor/three-addons/controls/OrbitControls.js"],
  ["node_modules/three/LICENSE", "vendor/three.LICENSE"],
  ["node_modules/astronomy-engine/esm/astronomy.js", "vendor/astronomy.js"],
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [from, to, optional] of FILES) {
    const src = new URL(`../${from}`, import.meta.url);
    if (optional && !existsSync(src)) continue;
    await mkdir(new URL(`../${to}/..`, import.meta.url), { recursive: true });
    await cp(src, new URL(`../${to}`, import.meta.url));
    console.log(`${from} -> ${to}`);
  }
}
