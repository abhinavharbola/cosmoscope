import test from "node:test";
import assert from "node:assert/strict";
import { inputDate } from "../src/dates.js";
import { MIN_MS, MAX_MS } from "../src/timeutil.js";

test("inputDate stays inside the range the date field accepts", () => {
  assert.equal(inputDate(MIN_MS, "utc"), "1801-01-01");
  assert.equal(inputDate(MAX_MS, "utc"), "2198-12-31");
  assert.ok(inputDate(MIN_MS, "local") >= "1801-01-01");
  assert.ok(inputDate(MAX_MS, "local") <= "2198-12-31");
});
