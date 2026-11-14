import test from "node:test";
import assert from "node:assert/strict";
import { TOURS } from "../src/tours.js";
import { VIEWS } from "../src/views.js";
import { ORDER, MOONS } from "../src/data.js";
import { SCALE_MIN, SCALE_MAX } from "../src/hash.js";
import { MIN_MS, MAX_MS } from "../src/ephemeris.js";

const known = new Set([...ORDER, ...MOONS.map((m) => m.id), ...Object.keys(VIEWS)]);

test("tour ids are unique and every tour has stops", () => {
  assert.equal(new Set(TOURS.map((t) => t.id)).size, TOURS.length);
  for (const t of TOURS) {
    assert.ok(t.title && t.blurb, t.id);
    assert.ok(t.steps.length >= 2, t.id);
  }
});

test("every tour stop names a built in focus, has text and a legal scale and date", () => {
  for (const t of TOURS) {
    for (const [i, s] of t.steps.entries()) {
      const where = `${t.id} ${i + 1}`;
      assert.ok(known.has(s.focus), `${where} focus ${s.focus}`);
      assert.ok(typeof s.text === "string" && s.text.length > 20, where);
      assert.ok(!/[\u2014\u2013]/.test(s.text), `${where} contains a dash glyph`);
      if (s.scale !== undefined) assert.ok(s.scale >= SCALE_MIN && s.scale <= SCALE_MAX, where);
      if (s.when !== undefined && s.when !== "now") {
        const ms = Date.parse(s.when);
        assert.ok(Number.isFinite(ms) && ms >= MIN_MS && ms <= MAX_MS, `${where} when ${s.when}`);
      }
    }
  }
});

test("a tour starts from a known time so a stale clock cannot strand it", () => {
  for (const t of TOURS) assert.ok(t.steps[0].when, t.id);
});
