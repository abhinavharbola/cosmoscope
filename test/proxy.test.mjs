import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../deploy/nasa-proxy-worker.js";

test("proxy injects the key, forwards allowed paths and rejects others", async () => {
  let seen;
  const fake = async (u) => {
    seen = u;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const ok = await handle(new Request("https://p.example/DONKI/FLR?startDate=2026-10-01&api_key=evil"), { NASA_API_KEY: "SECRET" }, fake);
  assert.equal(ok.status, 200);
  assert.equal(seen.searchParams.get("api_key"), "SECRET");
  assert.equal(seen.searchParams.get("startDate"), "2026-10-01");
  const bad = await handle(new Request("https://p.example/admin"), { NASA_API_KEY: "SECRET" }, fake);
  assert.equal(bad.status, 404);
});
