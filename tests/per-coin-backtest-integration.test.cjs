"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

test("browser strict-history helper loads before the application script", () => {
  const helper = html.indexOf('<script src="./lib/per-coin-backtest-history.browser.js"></script>');
  const app = html.indexOf('const $ = id => document.getElementById(id);');
  assert.notEqual(helper, -1);
  assert.notEqual(app, -1);
  assert.ok(helper < app);
});

test("per-coin backtest blocks non-COMPLETE history before calling the engine", () => {
  const start = html.indexOf("async function runCoinBt(sym){");
  const end = html.indexOf("/* pooled backtest", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const fn = html.slice(start, end);
  const gate = fn.indexOf("if(!history.accepted)");
  const engine = fn.indexOf("E.backtestCoin(r4,d,b.p,b.tl,sym,reg,CFG)");
  assert.notEqual(gate, -1);
  assert.notEqual(engine, -1);
  assert.ok(gate < engine);
  assert.match(fn, /callTool:\(server,tool,input\)=>mcp\.callTool\(server,tool,input\)/);
  assert.match(fn, /const r4=history\.rows/);
});

test("per-coin history uses the registered Binance Spot klines adapter", () => {
  assert.match(html, /const BIN = "Binance"/);
  assert.match(html, /"Binance":\s*\{\s*"spot\\.klines":i=>binance\("\/klines\?/);
  assert.match(html, /server:BIN, tool:TOOLS\.klines, symbol:sym/);
});

test("strict history integration leaves pooled backtest entry point present", () => {
  assert.match(html, /async function runPool\(reg\)/);
});
