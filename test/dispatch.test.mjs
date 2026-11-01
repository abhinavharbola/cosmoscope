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
globalThis.fetch = async (u) => {
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
