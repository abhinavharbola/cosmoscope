import test from "node:test";
import assert from "node:assert/strict";

const payloads = {
  "/planetary/apod": {
    title: '"><img src=x onerror=alert(1)>',
    url: "javascript:alert(1)",
    media_type: "image",
    date: "2026-10-31",
    copyright: "<script>bad()</script>",
  },
  "/neo/rest/v1/feed": { near_earth_objects: {} },
  "/DONKI/FLR": [{ classType: "<b>X9</b>", peakTime: "2026-10-30T10:00Z" }],
};

globalThis.document = { querySelector: () => null };
globalThis.location = { href: "https://site.example/" };
let failing = false;
globalThis.fetch = async (u) => {
  if (failing) throw new Error("offline");
  const path = new URL(u).pathname;
  return new Response(JSON.stringify(payloads[path]), { status: 200, headers: { "content-type": "application/json" } });
};

const { createDispatch } = await import("../src/dispatch.js");

test("dispatch escapes feed content and neutralises unsafe urls", async () => {
  const els = {
    body: { innerHTML: "" },
    badge: { textContent: "" },
    key: { value: "" },
    save: { addEventListener() {} },
    toggle: { addEventListener() {}, setAttribute() {} },
    panel: { hidden: true },
  };
  await createDispatch(els).load();
  const html = els.body.innerHTML;
  assert.ok(!html.includes("<img src=x"), html);
  assert.ok(!html.includes("<script>"), html);
  assert.ok(!html.includes("<b>X9"), html);
  assert.ok(!html.includes("javascript:"), html);
  assert.equal(els.badge.textContent, "0");
});

test("dispatch upgrades http image urls to https", async () => {
  payloads["/planetary/apod"] = { title: "T", url: "http://apod.example/a.jpg", media_type: "image", date: "2026-10-31" };
  const els = {
    body: { innerHTML: "" },
    badge: { textContent: "" },
    key: { value: "" },
    save: { addEventListener() {} },
    toggle: { addEventListener() {}, setAttribute() {} },
    panel: { hidden: true },
  };
  const { createDispatch: make } = await import("../src/dispatch.js");
  await make(els).load();
  assert.ok(els.body.innerHTML.includes("https://apod.example/a.jpg"), els.body.innerHTML);
  assert.ok(!els.body.innerHTML.includes("http://apod.example"), els.body.innerHTML);
});

test("a failed first load is retried when the panel is reopened", async () => {
  let click = null;
  const els = {
    body: { innerHTML: "" },
    badge: { textContent: "" },
    key: { value: "" },
    save: { addEventListener() {} },
    toggle: { addEventListener: (_, fn) => (click = fn), setAttribute() {} },
    panel: { hidden: true },
  };
  createDispatch(els);
  failing = true;
  click();
  await new Promise((r) => setTimeout(r, 30));
  assert.ok(!els.body.innerHTML.includes("Near-Earth"), els.body.innerHTML);
  failing = false;
  click();
  click();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(els.badge.textContent, "0");
});
