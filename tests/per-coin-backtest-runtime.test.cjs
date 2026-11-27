"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const start = html.indexOf("async function runCoinBt(sym){");
const end = html.indexOf("/* pooled backtest", start);
assert.notEqual(start, -1, "runCoinBt must exist");
assert.notEqual(end, -1, "runCoinBt boundary must exist");
const runCoinBtSource = html.slice(start, end);

function harness(history) {
  const calls = { engine: [], daily: 0, adapter: [] };
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
          assert.equal(options.server, "Binance");
          assert.equal(options.tool, "spot.klines");
          assert.equal(options.symbol, "BTCUSDT");
          await options.callTool(options.server, options.tool, {
            symbol: options.symbol,
            interval: "4h",
            limit: 1000
          });
          return typeof history === "function" ? history(rows) : history;
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
  assert.equal(h.context.CBT.BTCUSDT.error, "history page missing");
  assert.equal(h.context.CBT.BTCUSDT.historyStatus, "INCOMPLETE");
  assert.equal(h.context.CBTBUSY.BTCUSDT, undefined);
});

test("runtime: accepted strict history passes the exact validated rows to the engine", async () => {
  const h = harness(rows => ({
    accepted: true,
    status: "COMPLETE",
    reason: null,
    rows,
    pagination: { pageCount: 5, receivedCount: 5000, targetCandles: 4500 }
  }));

  await vm.runInContext(runCoinBtSource + '\nrunCoinBt("BTCUSDT")', h.context);

  assert.equal(h.calls.engine.length, 1);
  assert.equal(h.calls.engine[0][0], h.rows);
  assert.equal(h.calls.daily, 1);
  assert.equal(h.context.CBT.BTCUSDT.sym, "BTCUSDT");
  assert.equal(h.context.CBTBUSY.BTCUSDT, undefined);
});
