"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const start = html.indexOf("async function strictBacktestHistory(sym,interval,targetCandles){");
const end = html.indexOf("/* pooled backtest", start);
assert.notEqual(start, -1, "runCoinBt must exist");
assert.notEqual(end, -1, "runCoinBt boundary must exist");
const runCoinBtSource = html.slice(start, end);

function harness(history) {
  const calls = { engine: [], daily: 0, adapter: [], history: [] };
  const rows = Array.from({ length: 4500 }, (_, i) => [i]);
  const context = {
    BIN: "Binance",
    TOOLS: { klines: "spot.klines" },
    CFG: {},
    LAST: null,
    AUTORES: null,
    setTimeout: callback => { callback(); return 0; },
    CBT: {},
    CBTBUSY: {},
    BTCBT: null,
    mcp: {
      callTool: async (...args) => {
        calls.adapter.push(args);
        return { payload: [] };
      }
    },
    paintBt: () => {},
    btcForBt: async () => ({ p: { btc: true }, tl: { timeline: true } }),
    window: {
      TradesysPerCoinBacktestHistory: {
        load: async options => {
          calls.history.push({ symbol: options.symbol, interval: options.interval, targetCandles: options.targetCandles });
          assert.equal(options.server, "Binance");
          assert.equal(options.tool, "spot.klines");
          await options.callTool(options.server, options.tool, {
            symbol: options.symbol, interval: options.interval, limit: 1000
          });
          if (typeof history === "function") return history(rows, options);
          return history;
        }
      }
    },
    provider: {
      klines: async () => {
        calls.daily++;
        return [];
      }
    },
    E: {
      series: value => value,
      prepare: value => ({ prepared: value }),
      backtestCoin: (...args) => {
        calls.engine.push(args);
        return { sym: args[4], rows: [] };
      }
    }
  };
  vm.createContext(context);
  return { context, calls, rows };
}

test("runtime: rejected strict history never reaches the backtest engine", async () => {
  const h = harness({
    accepted: false,
    status: "INCOMPLETE",
    reason: "history page missing",
    pagination: { pageCount: 2, receivedCount: 2000, targetCandles: 4500 }
  });

  await vm.runInContext(runCoinBtSource + '\nrunCoinBt("BTCUSDT")', h.context);

  assert.equal(h.calls.engine.length, 0);
  assert.equal(h.calls.daily, 0);
  assert.equal(h.calls.history.length, 1);
  assert.equal(h.calls.history[0].interval, "4h");
  assert.equal(h.context.CBT.BTCUSDT.error, "history page missing");
  assert.equal(h.context.CBT.BTCUSDT.historyStatus, "INCOMPLETE");
  assert.equal(h.context.CBTBUSY.BTCUSDT, undefined);
});

test("runtime: accepted strict history passes the exact validated rows to the engine", async () => {
  const h = harness((rows, options) => ({
    accepted: true,
    status: "COMPLETE",
    reason: null,
    rows,
    pagination: { pageCount: 5, receivedCount: 5000, targetCandles: options.targetCandles }
  }));

  await vm.runInContext(runCoinBtSource + '\nrunCoinBt("BTCUSDT")', h.context);

  assert.equal(h.calls.engine.length, 1);
  assert.equal(h.calls.engine[0][0], h.rows);
  assert.equal(h.calls.daily, 0);
  assert.deepEqual(h.calls.history.map(x => [x.interval, x.targetCandles]), [["4h", 4500], ["1d", 1000]]);
  assert.equal(h.context.CBT.BTCUSDT.sym, "BTCUSDT");
  assert.equal(h.context.CBTBUSY.BTCUSDT, undefined);
});

test("runtime: rejected strict daily history never reaches the backtest engine", async () => {
  const h = harness((rows, options) => options.interval === "4h" ? ({
    accepted: true, status: "COMPLETE", reason: null, rows,
    pagination: { pageCount: 5, receivedCount: 5000, targetCandles: 4500 }
  }) : ({
    accepted: false, status: "INCOMPLETE", reason: "daily history gap",
    pagination: { pageCount: 1, receivedCount: 300, targetCandles: 1000 }
  }));

  await vm.runInContext(runCoinBtSource + '\nrunCoinBt("BTCUSDT")', h.context);

  assert.equal(h.calls.engine.length, 0);
  assert.equal(h.calls.history.length, 2);
  assert.equal(h.context.CBT.BTCUSDT.error, "daily history gap");
  assert.equal(h.context.CBT.BTCUSDT.historyStatus, "INCOMPLETE");
});
