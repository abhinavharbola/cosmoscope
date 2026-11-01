import test from "node:test";
import assert from "node:assert/strict";
import { parseHash, buildHash } from "../src/hash.js";
import { VIEWS_FOR_TEST } from "./support.mjs";

const valid = (f) => Object.hasOwn(VIEWS_FOR_TEST, f);

test("hash accepts known focus ids and rejects inherited property names", () => {
  assert.equal(parseHash("#f=Mars", valid).focus, "Mars");
  for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(parseHash(`#f=${bad}`, valid).focus, null, bad);
  }
});

test("hash range checks and round trip", () => {
  assert.equal(parseHash("#s=0", valid).scale, null);
  assert.equal(parseHash("#s=999999999999", valid).scale, null);
  assert.equal(parseHash("#t=1700-01-01T00:00:00Z", valid).ms, null);
  const now = Date.parse("2026-10-31T00:00:00Z");
  const h = buildHash("Mars", 3600, Date.parse("2020-01-01T00:00:00Z"), now);
  const back = parseHash(h, valid);
  assert.equal(back.focus, "Mars");
  assert.equal(back.scale, 3600);
  assert.equal(back.ms, Date.parse("2020-01-01T00:00:00Z"));
  assert.equal(buildHash("Overview", 1, now, now), "s=1");
});
