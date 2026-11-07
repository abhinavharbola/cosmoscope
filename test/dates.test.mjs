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

import { parseInputDate } from "../src/dates.js";

test("parseInputDate clamps out-of-range and two-digit years instead of wrapping them", () => {
  assert.equal(parseInputDate("0099-05-05", "utc"), MIN_MS);
  assert.equal(parseInputDate("0001-01-01", "utc"), MIN_MS);
  assert.equal(parseInputDate("1700-05-05", "utc"), MIN_MS);
  assert.equal(parseInputDate("9999-05-05", "utc"), MAX_MS);
  assert.equal(parseInputDate("2026-11-07", "utc"), Date.UTC(2026, 10, 7, 12));
  assert.ok(Number.isNaN(parseInputDate("", "utc")));
});
