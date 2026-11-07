import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseManifest } from "../src/texmanifest.js";

const texDir = fileURLToPath(new URL("../textures/", import.meta.url));
const raw = JSON.parse(await readFile(path.join(texDir, "manifest.json"), "utf8"));
const manifest = parseManifest(raw);
const ids = Object.keys(manifest);
const expected = process.argv.slice(2).flatMap((a) => a.split(",")).filter(Boolean);
let bad = 0;

for (const id of expected) {
  if (!ids.includes(id)) {
    console.error(`manifest has no entry for ${id}`);
    bad++;
  }
}

for (const id of ids) {
  const entry = manifest[id];
  for (const [tier, slots] of Object.entries(entry.tiers)) {
    for (const [slot, file] of Object.entries(slots)) {
      if (typeof file !== "string") continue;
      try {
        const s = await stat(path.join(texDir, file));
        if (!s.isFile() || s.size < 1024) throw new Error("empty");
      } catch {
        console.error(`${id} ${tier} ${slot}: missing or empty file ${file}`);
        bad++;
      }
    }
  }
}

if (bad) process.exit(1);
console.log(`texture manifest ok: ${ids.length} bodies`);
