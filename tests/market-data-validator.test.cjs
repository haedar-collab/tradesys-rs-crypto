"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateKlines, CODES } = require("../lib/market-data-validator.cjs");

const NOW = 10_000_000;
const HOUR = 60 * 60 * 1000;
const candle = (openTime = NOW - 2 * HOUR, overrides = {}) => {
  const row = [openTime, "10", "12", "9", "11", "100", openTime + HOUR - 1, "1100"];
  for (const [key, value] of Object.entries(overrides)) row[Number(key)] = value;
  return row;
};
const codes = result => result.errors.map(error => error.code);

test("accepts valid closed Binance klines", () => {
  const rows = [candle(NOW - 3 * HOUR), candle(NOW - 2 * HOUR)];
  const result = validateKlines(rows, { now: NOW, intervalMs: HOUR, minCandles: 2 });
  assert.equal(result.status, "VALID");
  assert.equal(result.valid, true);
  assert.equal(result.stats.acceptedCount, 2);
});

test("rejects non-array input", () => {
  const result = validateKlines(null, { now: NOW });
  assert.equal(result.status, "INVALID");
  assert.ok(codes(result).includes(CODES.INPUT_NOT_ARRAY));
});

test("reports an empty dataset as insufficient", () => {
  const result = validateKlines([], { now: NOW });
  assert.equal(result.status, "INSUFFICIENT");
  assert.ok(codes(result).includes(CODES.NO_CANDLES));
});

test("rejects malformed row shape", () => {
  const result = validateKlines([[1, 2]], { now: NOW });
  assert.ok(codes(result).includes(CODES.ROW_SHAPE_INVALID));
});

test("rejects non-finite OHLC prices", () => {
  const result = validateKlines([candle(undefined, { 2: "NaN" })], { now: NOW });
  assert.ok(codes(result).includes(CODES.PRICE_NOT_FINITE));
});

test("rejects zero or negative OHLC prices", () => {
  const result = validateKlines([candle(undefined, { 1: "0" })], { now: NOW });
  assert.ok(codes(result).includes(CODES.PRICE_NOT_POSITIVE));
});

test("rejects high below the candle range", () => {
  const result = validateKlines([candle(undefined, { 2: "8" })], { now: NOW });
  assert.ok(codes(result).includes(CODES.HIGH_BELOW_RANGE));
});

test("rejects low above the candle range", () => {
  const result = validateKlines([candle(undefined, { 3: "12.5" })], { now: NOW });
  assert.ok(codes(result).includes(CODES.LOW_ABOVE_RANGE));
});

test("rejects non-finite volume", () => {
  const result = validateKlines([candle(undefined, { 7: "NaN" })], { now: NOW });
  assert.ok(codes(result).includes(CODES.VOLUME_NOT_FINITE));
});

test("rejects negative volume", () => {
  const result = validateKlines([candle(undefined, { 5: "-1" })], { now: NOW });
  assert.ok(codes(result).includes(CODES.VOLUME_NEGATIVE));
});

test("rejects a candle at the exclusive close-time boundary", () => {
  const row = candle(NOW - HOUR);
  row[6] = NOW;
  const result = validateKlines([row], { now: NOW, intervalMs: HOUR });
  assert.ok(codes(result).includes(CODES.CANDLE_NOT_CLOSED));
});

test("rejects duplicate open timestamps", () => {
  const row = candle(NOW - 2 * HOUR);
  const result = validateKlines([row, [...row]], { now: NOW });
  assert.ok(codes(result).includes(CODES.DUPLICATE_TIMESTAMP));
});

test("rejects descending open timestamps without sorting", () => {
  const result = validateKlines([
    candle(NOW - HOUR),
    candle(NOW - 2 * HOUR)
  ], { now: NOW });
  assert.ok(codes(result).includes(CODES.TIMESTAMP_OUT_OF_ORDER));
});

test("rejects missing intervals when intervalMs is supplied", () => {
  const result = validateKlines([
    candle(NOW - 4 * HOUR),
    candle(NOW - 2 * HOUR)
  ], { now: NOW, intervalMs: HOUR });
  assert.ok(codes(result).includes(CODES.INTERVAL_GAP));
});

test("rejects non-standard positive interval spacing", () => {
  const result = validateKlines([
    candle(NOW - 3 * HOUR),
    candle(NOW - HOUR - 30 * 60 * 1000)
  ], { now: NOW, intervalMs: HOUR });
  assert.ok(codes(result).includes(CODES.INTERVAL_MISMATCH));
});

test("returns INSUFFICIENT when valid candle count is below the requested minimum", () => {
  const result = validateKlines([candle()], { now: NOW, minCandles: 2 });
  assert.equal(result.status, "INSUFFICIENT");
  assert.ok(codes(result).includes(CODES.INSUFFICIENT_CANDLES));
});

test("does not mutate source rows", () => {
  const rows = [candle()];
  const before = JSON.stringify(rows);
  validateKlines(rows, { now: NOW });
  assert.equal(JSON.stringify(rows), before);
});

test("does not silently repair malformed rows", () => {
  const rows = [candle(undefined, { 2: "8" }), candle()];
  const result = validateKlines(rows, { now: NOW });
  assert.equal(result.status, "INVALID");
  assert.equal(result.stats.rejectedCount, 1);
  assert.equal(result.stats.acceptedCount, 1);
});

test("validates options", () => {
  const result = validateKlines([candle()], { now: NOW, intervalMs: 0 });
  assert.equal(result.status, "INVALID");
  assert.ok(codes(result).includes(CODES.INVALID_OPTIONS));
});
