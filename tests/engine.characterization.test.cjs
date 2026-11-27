"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./engine-loader.cjs");

test("engine exposes the expected public API", () => {
  for (const key of [
    "DEFAULTS", "REGIME", "scan", "backtest", "series", "prepare",
    "smcAnalyze", "setupAt", "signalRecord", "signalText",
    "planStatus", "journalStats", "closedR", "edgeCheck", "ind"
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(E, key), `missing engine API: ${key}`);
  }
  for (const key of ["ema", "sma", "rsi", "atr", "adx", "bbands", "obv"]) {
    assert.equal(typeof E.ind[key], "function", `missing indicator: ${key}`);
  }
});

test("baseline EMA uses an SMA seed and returns null before the seed period", () => {
  assert.deepEqual(Array.from(E.ind.ema([1, 2, 3, 4], 3)), [null, null, 2, 3]);
});

test("baseline SMA returns a rolling average after the first full window", () => {
  assert.deepEqual(Array.from(E.ind.sma([1, 2, 3, 4], 2)), [null, 1.5, 2.5, 3.5]);
});

test("baseline RSI returns 100 for a rising series after warm-up", () => {
  const result = E.ind.rsi([1, 2, 3, 4, 5], 2);
  assert.equal(result[0], null);
  assert.equal(result[1], null);
  assert.equal(result[2], 100);
  assert.equal(result[4], 100);
});

test("series excludes candles whose close time has not passed", () => {
  const rows = [
    [1000, "10", "12", "9", "11", "100", 1999, "1100"],
    [2000, "11", "13", "10", "12", "120", 2999, "1440"],
    [3000, "12", "14", "11", "13", "130", 3999, "1690"]
  ];
  const result = E.series(rows, 2500);
  assert.deepEqual(Array.from(result.t), [1000]);
  assert.deepEqual(Array.from(result.c), [11]);
  assert.deepEqual(Array.from(result.v), [1100]);
});

test("baseline configuration preserves the SMC zone-width threshold", () => {
  assert.equal(E.DEFAULTS.smcMidWidthPct, 2.5);
  assert.equal(E.DEFAULTS.confirmBars, 2);
  assert.equal(E.DEFAULTS.minRR, 1.5);
});

test("watchlist parser strips USDT, removes BTC, and deduplicates", () => {
  assert.deepEqual(Array.from(E.parseWatchlist("ETHUSDT, SOL, eth, BTCUSDT, XRPUSDT")), ["ETH", "SOL", "XRP"]);
});

test("stock-token classifier preserves known crypto exceptions", () => {
  assert.equal(E.isStockToken("AAPL"), false);
  assert.equal(E.isStockToken("BNB"), false);
  assert.equal(E.isStockToken("SHIB"), false);
  assert.equal(E.isStockToken("XYZB"), true);
});

test("closed journal row at stop is recorded as -1R in the baseline model", () => {
  const result = E.closedR({
    entry: 100,
    stop: 90,
    tp1: 110,
    tp2: 120,
    status: "SL",
    playbook: "smc",
    size: 1000
  });
  assert.ok(Math.abs(result.r - (-1)) < 1e-12, `expected -1R, received ${result.r}`);
  assert.equal(result.partial, false);
});
