import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

register("./hooks.mjs", import.meta.url);

const html = readFileSync(new URL("../../index.html", import.meta.url), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: "http://localhost/#f=StubProbe&s=1" });
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

test("NASA feeds load on first open and a failed load is retried on reopen", async () => {
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
  assert.ok(fetchCalls > first);
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

test("jumping to a date while live is not undone on the next frame", () => {
  w.location.hash = "#s=1";
  frame();
  settle(3);
  $("clock-date").textContent = "";
  w.location.hash = "#s=1&t=2020-01-01T12:00:00Z";
  return pause(50).then(() => {
    settle(3);
    assert.ok($("clock-date").textContent.includes("2020"), $("clock-date").textContent);
  });
});

test("hash flags restore pause and reverse", async () => {
  w.location.hash = "#s=60&p=1&r=1";
  await pause(50);
  settle();
  assert.equal($("rate-readout").textContent, "Paused");
  assert.equal($("btn-reverse").classList.contains("active"), true);
  w.location.hash = "#s=60";
  await pause(50);
  settle();
  assert.equal($("btn-reverse").classList.contains("active"), false);
  assert.notEqual($("rate-readout").textContent, "Paused");
});

test("the almanac lists the next phase and the next season separately", () => {
  settle();
  const text = $("almanac").textContent;
  assert.ok(text.includes("Phase"), text);
  assert.ok(text.includes("Season"), text);
});

test("Space pauses even when an index row has focus, but still activates transport buttons", () => {
  w.location.hash = "#s=60";
  settle();
  const row = w.document.querySelector("#index .body-row");
  row.focus();
  const ev = press(row, " ");
  frame();
  assert.equal(ev.defaultPrevented, true);
  assert.equal($("rate-readout").textContent, "Paused");
  press(w.document.body, " ");
  frame();
  assert.notEqual($("rate-readout").textContent, "Paused");
  const ev2 = press($("btn-now"), " ");
  assert.equal(ev2.defaultPrevented, false);
});

test("view toggles in the hash are restored", async () => {
  w.location.hash = "#s=60&z=1&o=0&k=0";
  await pause(50);
  settle();
  assert.equal(stub.state.trueScale, true);
  assert.equal(stub.state.showOrbits, false);
  assert.equal(stub.state.showLabels, false);
  w.location.hash = "#s=60";
  await pause(50);
  assert.equal(stub.state.trueScale, false);
  assert.equal(stub.state.showOrbits, true);
});

test("a craft focus in the initial hash is applied once the missions have loaded", async () => {
  await pause(20);
  assert.equal(stub.calls.focus[0], "StubProbe");
});

test("the mission index lists loaded objects by kind and keeps body rows separate", async () => {
  const rows = [...w.document.querySelectorAll("#index .body-row.craft")];
  assert.equal(rows.length, 2);
  assert.equal(w.document.querySelectorAll("#index .body-row:not(.craft)").length, 10 + stubMoonCount());
  const subs = [...w.document.querySelectorAll("#index .index-sub")].map((e) => e.textContent);
  assert.deepEqual(subs, ["Spacecraft", "Comets"]);
  assert.equal(w.document.querySelector("#index .index-head").textContent, "Missions and small bodies");
  assert.equal(w.document.querySelector("#index .mission-list").hidden, false);
  w.location.hash = "#s=60";
  await pause(50);
  rows[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert.equal(stub.calls.focus.at(-1), "StubProbe");
  assert.ok(rows[0].classList.contains("active"));
});

test("a craft plate shows live rows, hides the size meter and restores it for a planet", () => {
  settle(40);
  assert.equal($("plate-name").textContent, "Stub Probe");
  assert.equal($("plate-type").textContent, "Spacecraft, launched 2020-01-01");
  assert.equal(w.document.querySelector("#plate .meter-wrap").hidden, true);
  assert.equal($("live-status").textContent, "Tracked");
  assert.ok(/^\d+\.\d+ AU$/.test($("live-sun").textContent), $("live-sun").textContent);
  assert.ok(/km\/s$/.test($("live-speed").textContent), $("live-speed").textContent);
  assert.ok($("plate-light").textContent.includes("A signal to Earth takes"), $("plate-light").textContent);
  assert.ok($("plate-src").textContent.includes("Giorgini"), $("plate-src").textContent);
  assert.ok($("plate-src").textContent.includes("not a live feed"));
  assert.equal(w.document.title, "Stub Probe | Cosmos");
  press(w.document.body, "4");
  assert.equal(w.document.querySelector("#plate .meter-wrap").hidden, false);
  assert.equal($("plate-name").textContent, "Mars");
});

test("outside its data window a craft says so instead of showing stale numbers", () => {
  w.document.querySelector("#index .body-row.craft").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  stub.craftControl.active = false;
  settle(40);
  assert.equal($("live-status").textContent, "After the data window");
  assert.equal($("live-sun").textContent, "n/a");
  assert.equal($("plate-light").textContent, "No trajectory data for this date.");
  assert.equal(w.document.querySelector("#index .body-row.craft .au").textContent, "no data");
  stub.craftControl.active = true;
  settle(40);
  assert.equal($("live-status").textContent, "Tracked");
});

test("catalog text is shown as text, never parsed as markup", () => {
  const comet = [...w.document.querySelectorAll("#index .body-row.craft")][1];
  assert.equal(comet.querySelector("b"), null);
  comet.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  settle(40);
  assert.equal($("plate-name").textContent, "C/2000 <b>X</b> & Y");
  assert.equal(w.document.querySelector("#plate b"), null);
  w.document.querySelector("#plate-more").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  assert.equal(w.document.querySelector("#plate-table i"), null);
  assert.ok($("plate-table").textContent.includes("<i>t</i>"));
  w.document.querySelector("#plate-more").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
});

test("the missions toggle appears with data, flips the state and round trips through the hash", async () => {
  settle(3);
  const btn = $("btn-missions");
  assert.equal(btn.hidden, false);
  assert.ok(btn.textContent.includes("On"));
  btn.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  settle(3);
  assert.equal(stub.state.showMissions, false);
  assert.ok(btn.textContent.includes("Off"));
  w.location.hash = "#s=60&m=0";
  await pause(50);
  assert.equal(stub.state.showMissions, false);
  w.location.hash = "#s=60";
  await pause(50);
  assert.equal(stub.state.showMissions, true);
});

test("a hash that names a craft is accepted once the missions exist, and unknown ids fall back", async () => {
  w.location.hash = "#f=StubComet&s=60";
  await pause(50);
  assert.equal(stub.calls.focus.at(-1), "StubComet");
  w.location.hash = "#f=constructor&s=60";
  await pause(50);
  assert.equal(stub.calls.focus.at(-1), "Overview");
});

function stubMoonCount() {
  return stub.moonCount;
}
