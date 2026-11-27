"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./engine-loader.cjs");

test("series uses an exclusive close-time boundary", () => {
  const rows = [
    [1000, "10", "12", "9", "11", "100", 1999, "1100"],
    [2000, "11", "13", "10", "12", "120", 2000, "1440"],
    [3000, "12", "14", "11", "13", "130", 2001, "1690"]
  ];

  const result = E.series(rows, 2000);
  assert.deepEqual(Array.from(result.t), [1000]);
  assert.deepEqual(Array.from(result.ct), [1999]);
});

test("series maps quote-asset volume from Binance kline field 7", () => {
  const rows = [
    [1000, "10", "12", "9", "11", "100", 1999, "1100"]
  ];

  const result = E.series(rows, 2000);
  assert.deepEqual(Array.from(result.v), [1100]);
});

test("baseline series does not validate malformed OHLCV values (known fail-safe gap)", () => {
  const rows = [
    // high < low and negative base volume; the current mapper still returns the row.
    [1000, "10", "8", "9", "11", "-5", 1999, "not-a-number"]
  ];

  const result = E.series(rows, 2000);
  assert.equal(result.n, undefined);
  assert.deepEqual(Array.from(result.t), [1000]);
  assert.deepEqual(Array.from(result.h), [8]);
  assert.deepEqual(Array.from(result.l), [9]);
  assert.deepEqual(Array.from(result.v).map(Number.isNaN), [true]);
});

test("baseline series preserves duplicate and out-of-order timestamps (known fail-safe gap)", () => {
  const rows = [
    [2000, "10", "12", "9", "11", "100", 2999, "1100"],
    [1000, "11", "13", "10", "12", "120", 1999, "1440"],
    [1000, "12", "14", "11", "13", "130", 1999, "1690"]
  ];

  const result = E.series(rows, 4000);
  assert.deepEqual(Array.from(result.t), [2000, 1000, 1000]);
});
