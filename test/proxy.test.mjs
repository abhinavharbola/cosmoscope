import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../deploy/nasa-proxy-worker.js";

const ENV = { NASA_API_KEY: "SECRET", ALLOW_ORIGIN: "https://site.example" };
const HEAD = { origin: "https://site.example" };

function fakeFetch(status = 200) {
  const calls = [];
  const fn = async (u) => {
    calls.push(u);
    return new Response("{}", { status, headers: { "content-type": "application/json" } });
  };
  fn.calls = calls;
  return fn;
}

test("proxy injects the key, forwards only whitelisted params and rejects other paths", async () => {
  const fake = fakeFetch();
  const ok = await handle(
    new Request("https://p.example/DONKI/FLR?startDate=2026-10-01&api_key=evil&extra=1", { headers: HEAD }),
    ENV,
    fake
  );
  assert.equal(ok.status, 200);
  const seen = fake.calls[0];
  assert.equal(seen.searchParams.get("api_key"), "SECRET");
  assert.equal(seen.searchParams.get("startDate"), "2026-10-01");
  assert.equal(seen.searchParams.get("extra"), null);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://site.example");
  assert.equal(ok.headers.get("cache-control"), "public, max-age=3600");
  const bad = await handle(new Request("https://p.example/admin", { headers: HEAD }), ENV, fake);
  assert.equal(bad.status, 404);
});

test("proxy rejects unknown origins, missing origin and missing configuration", async () => {
  const fake = fakeFetch();
  const url = "https://p.example/planetary/apod";
  assert.equal((await handle(new Request(url, { headers: { origin: "https://evil.example" } }), ENV, fake)).status, 403);
  assert.equal((await handle(new Request(url), ENV, fake)).status, 403);
  assert.equal((await handle(new Request(url, { headers: HEAD }), { NASA_API_KEY: "SECRET" }, fake)).status, 500);
  assert.equal((await handle(new Request(url, { headers: HEAD }), { ALLOW_ORIGIN: "https://site.example" }, fake)).status, 500);
  assert.equal(fake.calls.length, 0);
});

test("proxy validates dates, answers preflight and never caches errors", async () => {
  const fake = fakeFetch(429);
  const bad = await handle(new Request("https://p.example/DONKI/FLR?startDate=nope", { headers: HEAD }), ENV, fake);
  assert.equal(bad.status, 400);
  const pre = await handle(new Request("https://p.example/DONKI/FLR", { method: "OPTIONS", headers: HEAD }), ENV, fake);
  assert.equal(pre.status, 204);
  const limited = await handle(new Request("https://p.example/planetary/apod", { headers: HEAD }), ENV, fake);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("cache-control"), "no-store");
});

test("proxy reports upstream failure with cors headers", async () => {
  const boom = async () => {
    throw new Error("down");
  };
  const res = await handle(new Request("https://p.example/planetary/apod", { headers: HEAD }), ENV, boom);
  assert.equal(res.status, 502);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://site.example");
});
