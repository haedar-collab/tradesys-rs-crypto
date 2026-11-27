"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const {
  loadPerCoinBacktestHistory,
  FOUR_HOURS_MS
} = require("../lib/per-coin-backtest-history.cjs");

const browserSource = fs.readFileSync(
  path.join(__dirname, "../lib/per-coin-backtest-history.browser.js"),
  "utf8"
);
const browserContext = {
  module: { exports: {} }, Date, Number, Array, Object, String, Math,
  JSON, Promise, Error, TypeError, RangeError, globalThis: null
};
browserContext.globalThis = browserContext;
vm.runInNewContext(browserSource, browserContext, {
  filename: "per-coin-backtest-history.browser.js"
});
const browserHistory = browserContext.module.exports;

function makeRows(startOpen, count) {
  return Array.from({ length: count }, (_, index) => {
    const openTime = startOpen + index * FOUR_HOURS_MS;
    const closeTime = openTime + FOUR_HOURS_MS - 1;
    const price = 100 + index / 1000;
    return [
      openTime, String(price), String(price + 2), String(price - 2),
      String(price + 1), "10", closeTime, "1000", "20", "5", "500", "0"
    ];
  });
}

function createPagedCallTool({ rows, failAfterFirstPage = false }) {
  let calls = 0;
  return async (_server, _tool, input) => {
    calls += 1;
    if (failAfterFirstPage && calls > 1) {
      throw new Error("simulated older-page timeout");
    }
    const end = input.endTime == null ? Infinity : input.endTime;
    const eligible = rows.filter(row => row[0] <= end);
    return { payload: eligible.slice(-input.limit) };
  };
}

async function runBoth({ rows, now, targetCandles, pageLimit = 1000, maxPages = 5, failAfterFirstPage = false }) {
  const makeCall = () => createPagedCallTool({ rows, failAfterFirstPage });
  const common = {
    server: "Binance",
    tool: "spot.klines",
    symbol: "BTCUSDT",
    now,
    targetCandles,
    pageLimit,
    maxPages,
    maxRetries: 0
  };
  const [commonJs, browser] = await Promise.all([
    loadPerCoinBacktestHistory({ ...common, callTool: makeCall() }),
    browserHistory.load({ ...common, callTool: makeCall() })
  ]);
  return { commonJs, browser };
}

function assertSameDecision(results, expectedStatus, expectedAccepted, expectedRows) {
  for (const [name, result] of Object.entries(results)) {
    assert.equal(result.status, expectedStatus, name + " status");
    assert.equal(result.accepted, expectedAccepted, name + " acceptance");
    assert.equal(result.rows.length, expectedRows, name + " usable row count");
  }
}

test("CommonJS and browser boundaries agree on complete paginated history", async () => {
  const now = Date.UTC(2026, 10, 27);
  const newestOpen = Math.floor((now - FOUR_HOURS_MS * 2) / FOUR_HOURS_MS) * FOUR_HOURS_MS;
  const rows = makeRows(newestOpen - 4999 * FOUR_HOURS_MS, 5000);
  const results = await runBoth({ rows, now, targetCandles: 4500 });
  assertSameDecision(results, "COMPLETE", true, 4500);
  assert.deepEqual(results.browser.rows.map(row => row[0]), results.commonJs.rows.map(row => row[0]));
});

test("CommonJS and browser boundaries both block exhausted short history", async () => {
  const now = Date.UTC(2026, 10, 27);
  const newestOpen = Math.floor((now - FOUR_HOURS_MS * 2) / FOUR_HOURS_MS) * FOUR_HOURS_MS;
  const rows = makeRows(newestOpen - 599 * FOUR_HOURS_MS, 600);
  const results = await runBoth({ rows, now, targetCandles: 4500 });
  assertSameDecision(results, "HISTORY_EXHAUSTED", false, 0);
});

test("CommonJS and browser boundaries both block older-page fetch failures", async () => {
  const now = Date.UTC(2026, 10, 27);
  const newestOpen = Math.floor((now - FOUR_HOURS_MS * 2) / FOUR_HOURS_MS) * FOUR_HOURS_MS;
  const rows = makeRows(newestOpen - 999 * FOUR_HOURS_MS, 1000);
  const results = await runBoth({
    rows, now, targetCandles: 1500, pageLimit: 1000, maxPages: 2,
    failAfterFirstPage: true
  });
  assertSameDecision(results, "INCOMPLETE", false, 0);
});

test("CommonJS and browser boundaries both reject malformed OHLC data", async () => {
  const now = Date.UTC(2026, 10, 27);
  const newestOpen = Math.floor((now - FOUR_HOURS_MS * 2) / FOUR_HOURS_MS) * FOUR_HOURS_MS;
  const rows = makeRows(newestOpen - 999 * FOUR_HOURS_MS, 1000);
  rows[25][2] = "1";
  const results = await runBoth({ rows, now, targetCandles: 1000, maxPages: 1 });
  assertSameDecision(results, "INVALID", false, 0);
});
