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

test("accepts the actual MCP payload envelope and calls the Binance Spot kline tool contract", async () => {
  const now = 2_000_000_000_000;
  const rows = candles(1000);
  const calls = [];
  const result = await history.load({
    callTool: async (server, tool, input) => {
      calls.push({ server, tool, input });
      return { payload: rows };
    },
    server: "Binance", tool: "spot.klines", symbol: "BTCUSDT", now,
    targetCandles: 1000, pageLimit: 1000, maxPages: 1
  });
  assert.equal(result.accepted, true);
  assert.equal(result.rows.length, 1000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].server, "Binance");
  assert.equal(calls[0].tool, "spot.klines");
  assert.equal(calls[0].input.symbol, "BTCUSDT");
  assert.equal(calls[0].input.interval, "4h");
  assert.equal(calls[0].input.limit, 1000);
  assert.equal(calls[0].input.endTime, Math.floor(now / history.INTERVAL_MS) * history.INTERVAL_MS - 1);
});

test("browser history starts at the last closed 4H candle and excludes the forming candle", async () => {
  const now = 2_000_000_000_000;
  const interval = history.INTERVAL_MS;
  const boundary = Math.floor(now / interval) * interval;
  const closed = candles(1000, boundary - 1000 * interval, now);
  const p = 100 + closed.length / 1000;
  const forming = [boundary, String(p), String(p + 2), String(p - 2), String(p + 1),
    "10", boundary + interval - 1, "1000", "20", "5", "500", "0"];
  const apiRows = closed.concat([forming]);
  let requestedEndTime;
  const result = await history.load({
    callTool: async (_server, _tool, input) => {
      requestedEndTime = input.endTime;
      return apiRows.filter(row => row[0] <= input.endTime).slice(-input.limit);
    },
    server: "binance", tool: "klines", symbol: "BTCUSDT", now,
    targetCandles: 1000, pageLimit: 1000, maxPages: 1
  });
  assert.equal(requestedEndTime, boundary - 1);
  assert.equal(result.accepted, true);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.rows.length, 1000);
  assert.ok(result.rows.at(-1)[6] < now);
});

test("browser history helper blocks short history", async () => {
  const rows = candles(600);
  const result = await history.load({
    callTool: async () => rows,
    server: "binance", tool: "klines", symbol: "BTCUSDT", now: 2_000_000_000_000
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.equal(result.rows.length, 0);
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
  assert.equal(result.rows.length, 0);
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
  assert.equal(result.rows.length, 0);
});
