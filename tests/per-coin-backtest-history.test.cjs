"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  loadPerCoinBacktestHistory,
  FOUR_HOURS_MS
} = require("../lib/per-coin-backtest-history.cjs");

function makeRows(startOpen, count, now) {
  return Array.from({ length: count }, (_, index) => {
    const openTime = startOpen + index * FOUR_HOURS_MS;
    const closeTime = openTime + FOUR_HOURS_MS - 1;
    const price = 100 + (openTime / FOUR_HOURS_MS) * 0.001;
    return [openTime, String(price), String(price + 2), String(price - 2),
      String(price + 1), "10", closeTime, "1000", 5, "4", "400", "0"];
  });
}

function makePagedCallTool({ pageSize = 1000, pageCount = 5, now }) {
  const newestStart = Math.floor((now - FOUR_HOURS_MS * 2) / FOUR_HOURS_MS) * FOUR_HOURS_MS;
  const all = makeRows(newestStart - (pageSize * pageCount - 1) * FOUR_HOURS_MS,
    pageSize * pageCount, now);
  return async (server, tool, input) => {
    assert.equal(server, "Binance");
    assert.equal(tool, "spot.klines");
    const end = input.endTime == null ? Infinity : input.endTime;
    const eligible = all.filter(row => row[0] <= end);
    return { payload: eligible.slice(-input.limit) };
  };
}

test("accepts only a complete target-sized per-coin 4H history", async () => {
  const now = Date.UTC(2026, 10, 27);
  const result = await loadPerCoinBacktestHistory({
    callTool: makePagedCallTool({ now }),
    server: "Binance",
    tool: "spot.klines",
    symbol: "BTCUSDT",
    now,
    targetCandles: 4500,
    pageLimit: 1000,
    maxPages: 5,
    maxRetries: 0
  });

  assert.equal(result.accepted, true);
  assert.equal(result.status, "COMPLETE");
  assert.equal(result.rows.length, 4500);
  assert.equal(result.reason, null);
});

test("blocks history exhaustion before the required target is reached", async () => {
  const now = Date.UTC(2026, 10, 27);
  const callTool = makePagedCallTool({ now, pageSize: 600, pageCount: 1 });
  const result = await loadPerCoinBacktestHistory({
    callTool,
    server: "Binance",
    tool: "spot.klines",
    symbol: "NEWCOINUSDT",
    now,
    targetCandles: 4500,
    pageLimit: 1000,
    maxPages: 5,
    maxRetries: 0
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.deepEqual(result.rows, []);
  assert.match(result.reason, /required 4500 closed candles, received 600/);
});

test("blocks a failed older-page request even when a newer page was received", async () => {
  const now = Date.UTC(2026, 10, 27);
  let calls = 0;
  const firstPage = makeRows(
    Math.floor((now - FOUR_HOURS_MS * 2) / FOUR_HOURS_MS) * FOUR_HOURS_MS - 999 * FOUR_HOURS_MS,
    1000, now
  );
  const callTool = async () => {
    calls += 1;
    if (calls === 1) return { payload: firstPage };
    throw new Error("simulated older-page timeout");
  };

  const result = await loadPerCoinBacktestHistory({
    callTool,
    server: "Binance",
    tool: "spot.klines",
    symbol: "BTCUSDT",
    now,
    targetCandles: 1500,
    pageLimit: 1000,
    maxPages: 2,
    maxRetries: 0
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, "INCOMPLETE");
  assert.deepEqual(result.rows, []);
  assert.equal(result.history.pagination.fetchFailed, true);
});

test("blocks invalid candle rows instead of passing them downstream", async () => {
  const now = Date.UTC(2026, 10, 27);
  const invalidRows = makeRows(
    Math.floor((now - FOUR_HOURS_MS * 2) / FOUR_HOURS_MS) * FOUR_HOURS_MS - 999 * FOUR_HOURS_MS,
    1000, now
  );
  invalidRows[10][2] = "1"; // high below open/close

  const result = await loadPerCoinBacktestHistory({
    callTool: async () => ({ payload: invalidRows }),
    server: "Binance",
    tool: "spot.klines",
    symbol: "BTCUSDT",
    now,
    targetCandles: 1000,
    pageLimit: 1000,
    maxPages: 1,
    maxRetries: 0
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, "INVALID");
  assert.deepEqual(result.rows, []);
});

test("never accepts an empty first response as a valid backtest history", async () => {
  const now = Date.UTC(2026, 10, 27);
  const result = await loadPerCoinBacktestHistory({
    callTool: async () => ({ payload: [] }),
    server: "Binance",
    tool: "spot.klines",
    symbol: "DELISTEDUSDT",
    now,
    targetCandles: 100,
    pageLimit: 1000,
    maxPages: 1,
    maxRetries: 0
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, "HISTORY_EXHAUSTED");
  assert.deepEqual(result.rows, []);
});
