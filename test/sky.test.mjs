import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
const { installCanvas } = await import("../tools/canvas-stub.mjs");
installCanvas();
const { milkyWayTexture, milkyWayTextureAsync } = await import("../src/sky.js");

test("chunked sky painting is identical to the synchronous painter and yields", async () => {
  const sync = milkyWayTexture();
  let yields = 0;
  const chunked = await milkyWayTextureAsync(async () => {
    yields += 1;
  }, 0);
  assert.ok(yields > 10, String(yields));
  const a = sync.image.data;
  const b = chunked.image.data;
  assert.equal(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff += 1;
  assert.equal(diff, 0);
});
