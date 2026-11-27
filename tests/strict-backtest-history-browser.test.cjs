"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../lib/per-coin-backtest-history.browser.js"), "utf8");
function createLoader() {
  const context = {};
  vm.runInNewContext(source, context);
  return context.TradesysPerCoinBacktestHistory.load;
}
function makeRows(intervalMs, count, now) {
  const newestOpen = Math.floor(now / intervalMs) * intervalMs - intervalMs;
  const firstOpen = newestOpen - (count - 1) * intervalMs;
  return Array.from({ length: count }, (_, i) => {
    const openTime = firstOpen + i * intervalMs;
    const price = 100 + i / 100;
    return [openTime, String(price), String(price + 2), String(price - 2), String(price + 1),
      "10", openTime + intervalMs - 1, "1000", 5, "4", "400", "0"];
  });
}

test("browser strict-history helper accepts a complete closed 1D sample", async () => {
  const load = createLoader();
  const now = Date.UTC(2026, 10, 27);
  const intervalMs = 24 * 60 * 60 * 1000;
  const rows = makeRows(intervalMs, 400, now);
  let request;
  const result = await load({
    callTool: async (_server, _tool, input) => { request = input; return { payload: rows }; },
    server: "Binance", tool: "spot.klines", symbol: "ETHUSDT",
    interval: "1d", targetCandles: 400, pageLimit: 1000, maxPages: 1, maxRetries: 0, now
  });
  assert.equal(result.accepted, true);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.rows.length, 400);
  assert.equal(request.interval, "1d");
  assert.equal(request.endTime, now - 1);
});

test("browser strict-history helper rejects a 1D interval gap", async () => {
  const load = createLoader();
  const now = Date.UTC(2026, 10, 27);
  const intervalMs = 24 * 60 * 60 * 1000;
  const rows = makeRows(intervalMs, 400, now);
  rows[150][0] += intervalMs;
  const result = await load({
    callTool: async () => ({ payload: rows }),
    server: "Binance", tool: "spot.klines", symbol: "ETHUSDT",
    interval: "1d", targetCandles: 400, pageLimit: 1000, maxPages: 1, maxRetries: 0, now
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, "INVALID");
  assert.deepEqual(Array.from(result.rows), []);
});

test("browser strict-history helper rejects unsupported intervals without fetching", async () => {
  const load = createLoader();
  let calls = 0;
  const result = await load({
    callTool: async () => { calls++; return { payload: [] }; },
    server: "Binance", tool: "spot.klines", symbol: "ETHUSDT",
    interval: "1w", targetCandles: 10, pageLimit: 1000, maxPages: 1, maxRetries: 0
  });
  assert.equal(result.accepted, false);
  assert.equal(result.status, "INVALID");
  assert.equal(calls, 0);
});
