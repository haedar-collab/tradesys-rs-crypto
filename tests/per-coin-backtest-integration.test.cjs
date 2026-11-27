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
  assert.match(html, /async function strictBacktestHistory\(sym,interval,targetCandles\)/);
  assert.match(html, /callTool:\(server,tool,input\)=>mcp\.callTool\(server,tool,input\)/);
  assert.match(fn, /strictBacktestHistory\(sym,"4h",4500\)/);
  assert.match(fn, /strictBacktestHistory\(sym,"1d",1000\)/);
  assert.match(fn, /const r4=history\.rows/);
});

test("per-coin history uses the registered Binance Spot klines adapter", () => {
  assert.match(html, /const BIN = "Binance"/);
  assert.match(html, /"Binance"\s*:\s*\{\s*"spot\.klines"\s*:\s*i\s*=>\s*binance\(\s*"\/klines\?/);
  assert.match(html, /server:BIN,tool:TOOLS\.klines,symbol:sym/);
});

test("per-coin UI displays strict-history rejection diagnostics", () => {
  assert.match(html, /History status:/);
  assert.match(html, /c\.history&&c\.history\.pageCount/);
  assert.match(html, /c\.history&&c\.history\.receivedCount/);
  assert.match(html, /c\.history&&c\.history\.targetCandles/);
});

test("strict history integration leaves pooled backtest entry point present", () => {
  assert.match(html, /async function runPool\(reg\)/);
});

test("BTC daily benchmark must pass strict 1D history before engine preparation", () => {
  const start = html.indexOf("async function btcForBt(){");
  const end = html.indexOf("async function runCoinBt(sym){", start);
  const fn = html.slice(start, end);
  assert.match(fn, /strictBacktestHistory\("BTCUSDT","1d",1000\)/);
  assert.ok(fn.indexOf("if(!history.accepted)") < fn.indexOf("E.prepare(E.series(history.rows)"));
  assert.doesNotMatch(fn, /provider\.klines/);
});

test("pooled backtest validates both 4H and 1D histories before coinTrades", () => {
  const start = html.indexOf("async function runPool(reg){");
  const end = html.indexOf("function paintPool()", start);
  const fn = html.slice(start, end);
  assert.match(fn, /strictBacktestHistory\(sym,"4h",1000\)/);
  assert.match(fn, /strictBacktestHistory\(sym,"1d",400\)/);
  assert.ok(fn.indexOf("if(!h4.accepted||!h1.accepted)") < fn.indexOf("E.coinTrades("));
  assert.match(fn, /Object\.keys\(byCoin\)\.length>=10/);
  assert.doesNotMatch(fn, /provider\.klines/);
});

test("pooled cache rejects results created before strict-history validation", () => {
  assert.match(html, /POOL\.validationVersion===2/);
  assert.match(html, /validationVersion:2/);
  assert.match(html, /Strict history:/);
});

test("pooled backtest has a visible dashboard panel and a manual refresh control", () => {
  assert.match(html, /id="poolPanel"/);
  assert.match(html, /data-poolbox=""/);
  assert.match(html, /id="poolRefresh"/);
  assert.match(html, /document\.addEventListener\("click",e=>\{ const b=e\.target\.closest\("#poolRefresh"\)/);
});

test("pooled backtest starts automatically after a successful scan", () => {
  const start = html.indexOf("async function scan(){");
  const end = html.indexOf("/* ---------- web edition: navigation", start);
  const fn = html.slice(start, end);
  assert.match(fn, /ensurePool\(\)\.catch/);
  assert.ok(fn.indexOf("await persist(res)") < fn.indexOf("ensurePool().catch"));
});

test("Analysis, Dashboard, Watchlist and Entry Guide use the same setup action classifier", () => {
  assert.match(html, /function stepOf\(r\)/);
  assert.match(html, /function laneOf\(r\)/);
  assert.match(html, /const counts=Object\.fromEntries\(LANES\.map\(\(\[k\]\)=>\[k,rows\.filter\(r=>laneOf\(r\)===k\)\.length\]\)\)/);
  assert.match(html, /const \[action,cl\]=stepOf\(rowOfA\(a\)\)/);
  assert.match(html, /const step=r\?stepOf\(r\):null, lane=r\?laneOf\(r\):"none"/);
  assert.match(html, /const \[st,cl\]=stepOf\(r\)/);
});

test("global trading permission uses one shared status model across dashboard tabs", () => {
  assert.match(html, /const planState=ps=>/);
  assert.match(html, /planState\(planNow\(\)\)/);
  assert.match(html, /tile\("Trading plan",planState\(ps\)\.label/);
  assert.match(html, /tile\("Trading permission",planState\(ps\)\.label/);
  assert.match(html, /const ps=planNow\(\), state=planState\(ps\)/);
  assert.match(html, /const pstate=planState\(ps\)/);
});

test("circuit breaker is part of the shared trading permission and blocks taking signals", () => {
  assert.match(html, /LAST&&LAST\.brake\?\{key:"circuit-breaker",label:"CIRCUIT BREAKER"/);
  assert.match(html, /if\(LAST&&LAST\.brake\) return "Circuit breaker active: BTC market risk blocks new entries"/);
  assert.match(html, /const can=!ps\.halted&&!ps\.dayFull&&!\(LAST&&LAST\.brake\)/);
});

test("dashboard verdict and action items respect the shared trading permission", () => {
  assert.match(html, /const permission=planState\(ps\)/);
  assert.match(html, /if\(permission\.tone==="stop"\)/);
  assert.match(html, /if\(permission\.key==="clear"\) for\(const s of act\.slice\(0,3\)\)/);
  assert.match(html, /smcN=\(smcRows\(\)\|\|\[\]\)\.filter\(r=>\{const lane=laneOf\(r\)/);
});

test("market and watchlist labels distinguish screening, proximity and signal lifecycle states", () => {
  assert.match(html, /24h vol \(USDT\)<\/th><th class="l">RS filter<\/th>/);
  assert.match(html, /Distance to zone<\/th><th class="l">Zone proximity<\/th>/);
  assert.match(html, /<th class="l">Signal state<\/th>/);
  assert.match(html, /<span class="label">Signal state<\/span>/);
});
