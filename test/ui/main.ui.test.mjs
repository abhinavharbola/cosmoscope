import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

register("./hooks.mjs", import.meta.url);

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: "http://localhost/#s=1" });
const w = dom.window;

let fakeNow = Date.parse("2026-11-02T12:00:00Z");
Date.now = () => fakeNow;

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...rest) => {
  const handle = realSetTimeout(fn, ms, ...rest);
  if (ms > 5000 && handle.unref) handle.unref();
  return handle;
};

let fetchCalls = 0;

Object.assign(globalThis, {
  window: w,
  document: w.document,
  location: w.location,
  history: w.history,
  localStorage: w.localStorage,
  fetch: async () => {
    fetchCalls += 1;
    throw new Error("offline");
  },
});

let queue = [];
globalThis.requestAnimationFrame = (cb) => {
  queue.push(cb);
  return 1;
};
w.requestAnimationFrame = globalThis.requestAnimationFrame;

let t = 1000;
function frame(dtMs = 16) {
  t += dtMs;
  fakeNow += dtMs;
  const q = queue;
  queue = [];
  q.forEach((cb) => cb(t));
}

const stub = await import("./world-stub.mjs");
await import("../../src/main.js");

const $ = (id) => w.document.getElementById(id);
const press = (target, key, extra = {}) => {
  const ev = new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(ev);
  return ev;
};
const settle = (n = 3) => {
  for (let i = 0; i < n; i++) frame();
};
const pause = (ms) => new Promise((r) => realSetTimeout(r, ms));

test.after(() => w.close());

test("keyboard handling", () => {
  settle(5);
  assert.equal($("clock-state").textContent, "Live");

  const icon = $("btn-play").firstChild;
  settle(5);
  assert.equal($("btn-play").firstChild, icon);

  let ev = press($("btn-pulse"), " ");
  frame();
  assert.equal(ev.defaultPrevented, false);
  assert.notEqual($("rate-readout").textContent, "Paused");

  ev = press(w.document.body, " ");
  frame();
  assert.equal(ev.defaultPrevented, true);
  assert.equal($("rate-readout").textContent, "Paused");
  press(w.document.body, " ");
  frame();

  press(w.document.body, "r", { repeat: true });
  frame();
  assert.equal($("btn-reverse").classList.contains("active"), false);
  press(w.document.body, "r");
  frame();
  assert.equal($("btn-reverse").classList.contains("active"), true);
  press(w.document.body, "r");
  settle();

  press(w.document.body, "?");
  assert.equal($("help").hidden, false);
  const emits = stub.calls.emit;
  press(w.document.body, "l");
  press(w.document.body, "4");
  assert.equal(stub.calls.emit, emits);
  assert.notEqual(stub.calls.focus.at(-1), "Mars");
  press(w.document.body, "Escape");
  assert.equal($("help").hidden, true);
});

test("NASA feeds load on the first panel open only", async () => {
  settle();
  assert.equal(fetchCalls, 0);
  $("dispatch-toggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await pause(50);
  assert.equal($("dispatch").hidden, false);
  const first = fetchCalls;
  assert.ok(first > 0);
  $("dispatch-toggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  $("dispatch-toggle").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await pause(50);
  assert.equal(fetchCalls, first);
});

test("the clock stays live across a stalled frame", () => {
  settle(3);
  assert.equal($("clock-state").textContent, "Live");
  frame(10000);
  settle(3);
  assert.equal($("clock-state").textContent, "Live");
});

test("the view buttons live outside the hidden body list", () => {
  assert.ok(w.document.querySelector(".index-list"));
  assert.ok(w.document.querySelector("#index > .views"));
});

test("editing the hash applies focus, scale and the overview fallback", async () => {
  w.location.hash = "#f=Mars&s=60";
  await pause(50);
  assert.equal(stub.calls.focus.at(-1), "Mars");
  const want = Math.round((Math.log(60) / Math.log(315576000)) * 1000);
  assert.ok(Math.abs(Number($("scale").value) - want) <= 1, $("scale").value);
  w.location.hash = "#s=60";
  await pause(50);
  assert.equal(stub.calls.focus.at(-1), "Overview");
});

test("a clock wrap stops the light pulse with its own message", async () => {
  w.location.hash = "#s=315576000&t=2198-12-31T23:59:58Z";
  await pause(50);
  const stops = stub.calls.stop;
  press(w.document.body, "l");
  frame();
  assert.ok(stub.calls.emit > 0);
  settle();
  assert.ok(stub.calls.stop > stops);
  assert.ok($("ruler-last").textContent.includes("wrapped"), $("ruler-last").textContent);
});
