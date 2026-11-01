import test from "node:test";
import assert from "node:assert/strict";
import { parseManifest, resolveFiles, surfaceKey, availableTiers, centerLonOffset, safePath } from "../src/texmanifest.js";

const v2 = {
  version: 2,
  bodies: {
    Earth: {
      credit: "NASA",
      license: "Public domain",
      url: "https://visibleearth.nasa.gov/",
      centerLon: 0,
      tiers: {
        "2k": { map: "Earth/2k/map.jpg", lights: "Earth/2k/lights.jpg", cloudMask: "Earth/2k/cloudMask.jpg" },
        "4k": { map: "Earth/4k/map.jpg" },
      },
    },
    Mars: { tiers: { "2k": { bump: "Mars/2k/bump.jpg" } } },
  },
};

test("manifest v2 keeps bodies that have a map and drops the rest", () => {
  const m = parseManifest(v2);
  assert.deepEqual(Object.keys(m), ["Earth"]);
  assert.equal(m.Earth.credit, "NASA");
  assert.equal(m.Earth.url, "https://visibleearth.nasa.gov/");
});

test("legacy flat manifest is read as the 2k tier", () => {
  const m = parseManifest({ Mars: { map: "mars.jpg", bump: "mars_bump.jpg" }, Jupiter: { map: "jupiter.jpg" } });
  assert.equal(m.Mars.tiers["2k"].map, "mars.jpg");
  assert.equal(m.Mars.tiers["2k"].bump, "mars_bump.jpg");
  assert.equal(m.Jupiter.tiers["2k"].map, "jupiter.jpg");
});

test("manifest rejects unsafe paths, bad ids and non-https links", () => {
  for (const bad of ["../x.jpg", "/etc/passwd", "https://evil.example/x.jpg", "a//b.jpg", "a/./b.jpg", "a\\b.jpg", "", 5, null]) {
    assert.equal(safePath(bad), false, String(bad));
  }
  assert.equal(safePath("Earth/2k/map.jpg"), true);
  const m = parseManifest(
    JSON.parse(`{"bodies":{
      "__proto__":{"tiers":{"2k":{"map":"x.jpg"}}},
      "bad id":{"tiers":{"2k":{"map":"x.jpg"}}},
      "Venus":{"url":"javascript:alert(1)","tiers":{"2k":{"map":"../x.jpg"}}},
      "Pluto":{"url":"http://insecure.example","tiers":{"2k":{"map":"Pluto/2k/map.jpg"}}}
    }}`)
  );
  assert.equal(Object.getPrototypeOf(m), null);
  assert.deepEqual(Object.keys(m), ["Pluto"]);
  assert.equal(m.Pluto.url, null);
  assert.deepEqual(Object.keys(parseManifest("nope")), []);
  assert.deepEqual(Object.keys(parseManifest(null)), []);
});

test("tier resolution prefers the wanted tier, then lower, then higher", () => {
  const e = parseManifest(v2).Earth;
  const at4 = resolveFiles(e, "4k");
  assert.deepEqual(at4.map, { file: "Earth/4k/map.jpg", tier: "4k" });
  assert.deepEqual(at4.lights, { file: "Earth/2k/lights.jpg", tier: "2k" });
  const at8 = resolveFiles(e, "8k");
  assert.equal(at8.map.tier, "4k");
  const only4 = parseManifest({ Moon: { tiers: { "4k": { map: "Moon/4k/map.jpg" } } } }).Moon;
  assert.equal(resolveFiles(only4, "2k").map.tier, "4k");
});

test("surface key changes only when the resolved files change", () => {
  const e = parseManifest(v2).Earth;
  assert.equal(surfaceKey(e, "4k") === surfaceKey(e, "2k"), false);
  assert.equal(surfaceKey(e, "8k"), surfaceKey(e, "4k"));
});

test("available tiers lists tiers that carry a map", () => {
  assert.deepEqual(availableTiers(parseManifest(v2)), ["2k", "4k"]);
  assert.deepEqual(availableTiers(parseManifest(null)), []);
});

test("center longitude offset shifts u so longitude 0 lands at the image center", () => {
  assert.equal(centerLonOffset(0), 0);
  assert.equal(centerLonOffset(180), -0.5);
  assert.equal(centerLonOffset(-90), 0.25);
  assert.equal(centerLonOffset("x"), 0);
  const m = parseManifest({ Pluto: { centerLon: 999, map: "p.jpg" }, Mars: { centerLon: 180, map: "m.jpg" } });
  assert.equal(m.Pluto.centerLon, 0);
  assert.equal(m.Mars.centerLon, 180);
});
