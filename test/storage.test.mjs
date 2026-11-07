import test from "node:test";
import assert from "node:assert/strict";
import { esc } from "../src/escape.js";

test("esc escapes markup characters including single quotes", () => {
  assert.equal(esc(`<a href="x" onclick='y'>&</a>`), "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
});

test("storage helpers fail soft when localStorage is unavailable", async () => {
  const s = await import("../src/storage.js");
  assert.equal(s.readStore("a"), null);
  assert.equal(s.writeStore("a", "b"), false);
  assert.equal(s.removeStore("a"), false);
  assert.deepEqual(s.storeKeys(), []);
});

test("storage helpers round trip when localStorage exists", async () => {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
  Object.defineProperty(globalThis.localStorage, "x", { value: 1, enumerable: true });
  const s = await import("../src/storage.js");
  assert.equal(s.writeStore("k", "v"), true);
  assert.equal(s.readStore("k"), "v");
  assert.equal(s.removeStore("k"), true);
  assert.equal(s.readStore("k"), null);
  delete globalThis.localStorage;
});
