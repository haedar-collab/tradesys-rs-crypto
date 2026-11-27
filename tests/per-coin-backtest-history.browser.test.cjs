"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../lib/per-coin-backtest-history.browser.js"), "utf8");
const context = { module: { exports: {} }, Date, Number, Array, Object, String, Math, JSON, Promise, Error, TypeError, RangeError, globalThis: null };
context.globalThis = context;
vm.runInNewContext(source, context, { filename: "per-coin-backtest-history.browser.js" });
const history = context.module.exports;

function candles(count, start = 1_700_000_000_000, now = 2_000_000_000_000) {
  const interval = history.INTERVAL_MS;
  return Array.from({ length: count }, (_, i) => {
    const t = start + i * interval, p = 100 + i / 1000;
    return [t, String(p), String(p + 2), String(p - 2), String(p + 1), "10", t + interval - 1, "1000", "20", "5", "500", "0"];
  }).filter(row => row[6] < now);
}

test("browser history helper accepts only a complete, contiguous target sample", async () => {
  const rows = candles(4500);
  const result = await history.load({
    callTool: async (_server, _tool, input) => {
      const end = input.endTime;
      const eligible = end == null ? rows : rows.filter(row => row[0] <= end);
      return eligible.slice(-input.limit);
    },
    server: "binance", tool: "klines", symbol: "BTCUSDT", now: 2_000_000_000_000
  });
  assert.equal(result.accepted, true);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.rows.length, 4500);
});

test("browser history helper blocks short history", async () => {
  const rows = candles(600);
  const result = await history.load({
    callTool: async () => rows,
    server: "binance", tool: "klines", symbol: "BTCUSDT", now: 2_000_000_000_000
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.deepEqual(result.rows, []);
});

test("browser history helper blocks older-page fetch failure", async () => {
  const rows = candles(4500);
  let calls = 0;
  const result = await history.load({
    callTool: async () => { calls += 1; if (calls === 1) return rows.slice(-1000); throw new Error("offline"); },
    server: "binance", tool: "klines", symbol: "BTCUSDT", now: 2_000_000_000_000
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, "INCOMPLETE");
  assert.deepEqual(result.rows, []);
});

test("browser history helper rejects malformed candle data", async () => {
  const rows = candles(1000);
  rows[20][6] += 1;
  const result = await history.load({
    callTool: async () => rows,
    server: "binance", tool: "klines", symbol: "BTCUSDT", now: 2_000_000_000_000
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, "INVALID");
  assert.deepEqual(result.rows, []);
});
